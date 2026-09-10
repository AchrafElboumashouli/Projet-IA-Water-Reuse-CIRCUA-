const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const SALT_ROUNDS = 12;
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_EXPIRY_MINUTES = 15;
const ADMIN_APPROVAL_TOKEN_BYTES = 32;
const ADMIN_APPROVAL_TOKEN_EXPIRY_HOURS = 24;

async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

async function verifyPassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, tokenType: 'refresh' },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

/**
 * Generates a cryptographically secure password reset token.
 * Returns both:
 *  - rawToken: sent to the user by email (never stored)
 *  - tokenHash: SHA-256 hash of rawToken, stored in the database
 * Storing only the hash means a database leak cannot be used to reset passwords,
 * since the raw token cannot be recovered from the hash.
 */
function generateResetToken() {
  const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
  const tokenHash = hashResetToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);
  return { rawToken, tokenHash, expiresAt };
}

function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Generates a cryptographically secure, single-use admin-approval token
 * (used for the one-click Approve/Reject links sent to ADMIN_APPROVAL_EMAIL).
 * Same pattern as the password reset token:
 *  - rawToken: embedded in the email links, never stored
 *  - tokenHash: SHA-256 hash of rawToken, the only thing persisted
 * so a database leak alone can never be used to approve/reject an account.
 */
function generateAdminApprovalToken() {
  const rawToken = crypto.randomBytes(ADMIN_APPROVAL_TOKEN_BYTES).toString('hex');
  const tokenHash = hashAdminApprovalToken(rawToken);
  const expiresAt = new Date(Date.now() + ADMIN_APPROVAL_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
  return { rawToken, tokenHash, expiresAt };
}

function hashAdminApprovalToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

module.exports = {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateResetToken,
  hashResetToken,
  RESET_TOKEN_EXPIRY_MINUTES,
  generateAdminApprovalToken,
  hashAdminApprovalToken,
  ADMIN_APPROVAL_TOKEN_EXPIRY_HOURS,
};
