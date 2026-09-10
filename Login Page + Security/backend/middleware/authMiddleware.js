const { verifyAccessToken } = require('../services/authService');
const userModel = require('../models/userModel');

/**
 * Requires a valid access token (from httpOnly cookie or Authorization header).
 * Always re-checks the user's current role/status from the DB — the token's
 * embedded role is never trusted alone for authorization decisions on
 * sensitive routes; requireRole() re-fetches from the database.
 */
async function requireAuth(req, res, next) {
  try {
    const tokenFromCookie = req.cookies && req.cookies.access_token;
    const authHeader = req.headers.authorization;
    const tokenFromHeader =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    const token = tokenFromCookie || tokenFromHeader;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
    }

    const user = await userModel.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: 'User account no longer exists.' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'This account has been deactivated.' });
    }

    req.user = user; // trusted, freshly loaded from DB
    return next();
  } catch (err) {
    console.error('requireAuth error:', err);
    return res.status(500).json({ error: 'Internal authentication error.' });
  }
}

/**
 * Restricts access to one or more roles.
 * Usage: requireRole('admin') or requireRole('admin', 'user')
 * Relies on req.user.role, which was loaded fresh from the database by requireAuth.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };
