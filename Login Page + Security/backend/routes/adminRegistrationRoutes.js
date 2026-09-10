const express = require('express');
const rateLimit = require('express-rate-limit');

const adminRegistrationController = require('../controllers/adminRegistrationController');

const router = express.Router();

// These endpoints are intentionally unauthenticated (clicked straight from
// an email client), so a rate limiter is the main defense against token
// brute-forcing/abuse. Tokens themselves are 32 random bytes (cryptographically
// infeasible to guess), so this is defense-in-depth rather than the primary control.
const approvalLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/approve', approvalLinkLimiter, adminRegistrationController.approveByToken);
router.get('/reject', approvalLinkLimiter, adminRegistrationController.rejectByToken);

module.exports = router;
