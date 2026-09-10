const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');

const authController = require('../controllers/authController');
const validateRequest = require('../middleware/validateRequest');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: 'Too many registration attempts. Please try again later.' },
});

// Generous enough for legitimate retries, tight enough to slow down abuse
// (email-bombing a target, or brute-forcing reset tokens).
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many password reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  '/register',
  registerLimiter,
  [
    body('fullName').trim().isLength({ min: 2, max: 150 }).withMessage('Full name is required.'),
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be 3-50 characters.')
      .matches(/^[a-zA-Z0-9_.-]+$/)
      .withMessage('Username may only contain letters, numbers, and _ . -'),
    body('email').trim().isEmail().withMessage('A valid email is required.').normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters.')
      .matches(/[A-Z]/)
      .withMessage('Password must contain an uppercase letter.')
      .matches(/[0-9]/)
      .withMessage('Password must contain a number.'),
    body('confirmPassword').custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match.');
      }
      return true;
    }),
    body('role').optional().isIn(['admin', 'user', 'guest']).withMessage('Invalid role.'),
  ],
  validateRequest,
  authController.register
);

router.post(
  '/login',
  loginLimiter,
  [
    body('identifier').trim().notEmpty().withMessage('Email or username is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
  ],
  validateRequest,
  authController.login
);

router.post('/logout', authController.logout);

router.get('/me', requireAuth, authController.me);

router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  [
    body('email').trim().isEmail().withMessage('A valid email is required.').normalizeEmail(),
  ],
  validateRequest,
  authController.forgotPassword
);

router.post(
  '/reset-password',
  resetPasswordLimiter,
  [
    body('token').trim().notEmpty().withMessage('Reset token is required.'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters.'),
  ],
  validateRequest,
  authController.resetPassword
);

module.exports = router;
