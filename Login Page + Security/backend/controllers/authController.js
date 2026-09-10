const userModel = require('../models/userModel');
const {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  generateResetToken,
  hashResetToken,
  RESET_TOKEN_EXPIRY_MINUTES,
  generateAdminApprovalToken,
  ADMIN_APPROVAL_TOKEN_EXPIRY_HOURS,
} = require('../services/authService');
const {
  sendPasswordResetEmail,
  sendAdminApprovalRequestEmail,
  sendAdminApprovedEmail,
  sendAdminRejectedEmail,
} = require('../services/emailService');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
// Base URL the backend itself is reachable at — used to build the one-click
// email Approve/Reject links, which must hit this API directly (not the
// frontend). Falls back to a sane local dev default.
const BACKEND_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;

// Read from config only — never hardcoded (see registration security notes below).
const ADMIN_APPROVAL_EMAIL = process.env.ADMIN_APPROVAL_EMAIL;
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'admin@example.com';

// Generic, identical response for both existing and non-existing emails.
// This is deliberate: it prevents attackers from using this endpoint to
// enumerate which email addresses have accounts.
const GENERIC_FORGOT_PASSWORD_MESSAGE =
  'If an account exists, a password reset email has been sent.';

const VALID_ROLES = ['admin', 'user', 'guest'];

const ENFORCE_SAFE_ROLES = process.env.ENFORCE_SAFE_PUBLIC_ROLES !== 'false';
const DEFAULT_PUBLIC_ROLE = process.env.DEFAULT_PUBLIC_ROLE || 'user';

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    maxAge: maxAgeMs,
    path: '/',
  };
}

function sanitizeUser(user) {
  // Never return the password hash to the client.
  const { password_hash, ...safe } = user;
  return safe;
}

async function register(req, res) {
  try {
    const { fullName, username, email, password, role } = req.body;

    const existingEmail = await userModel.findByEmail(email);
    if (existingEmail) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    const existingUsername = await userModel.findByUsername(username);
    if (existingUsername) {
      return res.status(409).json({ error: 'This username is already taken.' });
    }

    // Security: which roles the public registration form may assign.
    // 'admin' is now allowed through, but only ever created in a 'pending'
    // state that cannot log in until an existing admin approves it (see the
    // login() function below). ENFORCE_SAFE_PUBLIC_ROLES remains a kill
    // switch: setting it to 'false' restores the old behavior of silently
    // downgrading any non-user/guest role request to DEFAULT_PUBLIC_ROLE.
    let finalRole = DEFAULT_PUBLIC_ROLE;
    if (role && VALID_ROLES.includes(role)) {
      if (role === 'admin') {
        finalRole = ENFORCE_SAFE_ROLES ? 'admin' : DEFAULT_PUBLIC_ROLE;
      } else {
        finalRole = role;
      }
    }

    const isAdminRequest = finalRole === 'admin';
    const approvalStatus = isAdminRequest ? 'pending' : 'approved';

    const passwordHash = await hashPassword(password);

    const user = await userModel.createUser({
      fullName,
      username,
      email,
      passwordHash,
      role: finalRole,
      approvalStatus,
    });

    // Newly created admin accounts start inactive until approved, so they
    // cannot log in even if something else went wrong with the status check.
    if (isAdminRequest) {
      // is_active defaults to TRUE at the DB level; explicitly deactivate
      // pending admin accounts using the existing updateUser path so we
      // don't duplicate raw SQL here.
      await userModel.updateUser(user.id, { is_active: false });

      if (ADMIN_APPROVAL_EMAIL) {
        try {
          // Generate a single-use, cryptographically secure token for the
          // one-click email approve/reject links. Only its hash is stored
          // (see generateAdminApprovalToken), and it expires in 24 hours.
          const { rawToken, tokenHash, expiresAt } = generateAdminApprovalToken();
          await userModel.createAdminApprovalToken(user.id, tokenHash, expiresAt);

          const approveUrl = `${BACKEND_URL}/api/admin-registration/approve?token=${rawToken}`;
          const rejectUrl = `${BACKEND_URL}/api/admin-registration/reject?token=${rawToken}`;

          await sendAdminApprovalRequestEmail({
            to: ADMIN_APPROVAL_EMAIL,
            fullName: user.full_name,
            username: user.username,
            email: user.email,
            requestedRole: 'admin',
            registeredAt: new Date(user.created_at).toLocaleString(),
            approveUrl,
            rejectUrl,
            expiresInHours: ADMIN_APPROVAL_TOKEN_EXPIRY_HOURS,
          });
        } catch (emailErr) {
          // Don't fail the registration if the notification email fails to
          // send — the request still exists and can be found/approved from
          // the Admin Dashboard. Just log it server-side.
          console.error('register: failed to send admin approval request email:', emailErr);
        }
      } else {
        console.warn(
          'register: ADMIN_APPROVAL_EMAIL is not configured — admin approval request email was not sent.'
        );
      }

      return res.status(201).json({
        message:
          'Registration completed successfully. Your request for an Admin account has been sent for approval. ' +
          'Please wait until your account is reviewed. If approval takes longer than expected, please contact: ' +
          SUPPORT_EMAIL,
        pendingApproval: true,
        supportEmail: SUPPORT_EMAIL,
        user,
      });
    }

    return res.status(201).json({
      message: 'Account created successfully.',
      pendingApproval: false,
      user,
    });
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ error: 'Failed to register user.' });
  }
}

async function login(req, res) {
  try {
    const { identifier, password } = req.body;

    const user = await userModel.findByEmailOrUsername(identifier);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    if (user.approval_status === 'pending') {
      return res.status(403).json({ error: 'Your account is awaiting administrator approval.' });
    }
    if (user.approval_status === 'rejected') {
      return res.status(403).json({ error: 'Your registration request has been rejected.' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'This account has been deactivated.' });
    }

    const validPassword = await verifyPassword(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    await userModel.updateLastLogin(user.id);

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.cookie('access_token', accessToken, cookieOptions(15 * 60 * 1000));
    res.cookie('refresh_token', refreshToken, cookieOptions(7 * 24 * 60 * 60 * 1000));

    return res.json({
      message: 'Login successful.',
      user: sanitizeUser(user),
      accessToken, // also returned for clients that prefer Authorization header
    });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Failed to log in.' });
  }
}

async function logout(req, res) {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/' });
  return res.json({ message: 'Logged out successfully.' });
}

async function me(req, res) {
  // req.user was set by requireAuth and freshly loaded from the DB.
  return res.json({ user: req.user });
}

async function forgotPassword(req, res) {
  const { email } = req.body;

  try {
    const user = await userModel.findByEmail(email);

    // Always behave the same way whether or not the user exists, and always
    // return the same generic message, so the endpoint cannot be used to
    // enumerate registered email addresses.
    if (user) {
      const { rawToken, tokenHash, expiresAt } = generateResetToken();

      // Overwriting any previously stored token here automatically
      // invalidates old reset links (only the latest token is ever valid).
      await userModel.setResetToken(user.id, tokenHash, expiresAt);

      const resetUrl = `${FRONTEND_URL}/reset-password/${rawToken}`;

      try {
        await sendPasswordResetEmail({
          to: user.email,
          resetUrl,
          expiresInMinutes: RESET_TOKEN_EXPIRY_MINUTES,
        });
      } catch (emailErr) {
        // Log the SMTP failure server-side, but never leak it to the client:
        // doing so would reveal that the email address exists.
        console.error('forgotPassword: failed to send reset email:', emailErr);
      }
    }

    return res.json({ message: GENERIC_FORGOT_PASSWORD_MESSAGE });
  } catch (err) {
    console.error('forgotPassword error:', err);
    // Even on unexpected/database errors we keep the response generic.
    return res.json({ message: GENERIC_FORGOT_PASSWORD_MESSAGE });
  }
}

async function resetPassword(req, res) {
  try {
    const { token, password } = req.body;

    const tokenHash = hashResetToken(token);
    const user = await userModel.findByResetTokenHash(tokenHash);

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset link.' });
    }

    if (!user.reset_token_expiry || new Date(user.reset_token_expiry) < new Date()) {
      // Token has expired: clear it out so it can't linger, then reject.
      await userModel.clearResetToken(user.id);
      return res.status(400).json({ error: 'Invalid or expired reset link.' });
    }

    const passwordHash = await hashPassword(password);

    // Updating the password and clearing the token happen atomically so the
    // token is guaranteed to be usable exactly once.
    await userModel.resetPasswordTransaction(user.id, passwordHash);

    return res.json({ message: 'Your password has been reset successfully.' });
  } catch (err) {
    console.error('resetPassword error:', err);
    return res.status(500).json({ error: 'Failed to reset password. Please try again.' });
  }
}

module.exports = { register, login, logout, me, forgotPassword, resetPassword };
