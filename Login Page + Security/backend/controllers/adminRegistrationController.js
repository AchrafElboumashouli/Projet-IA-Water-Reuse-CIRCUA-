const userModel = require('../models/userModel');
const { hashAdminApprovalToken } = require('../services/authService');
const {
  sendAdminApprovedEmail,
  sendAdminRejectedEmail,
  buildActionResultPage,
} = require('../services/emailService');

const BRAND_NAME = 'Smart Water Quality Monitoring';

function invalidTokenPage(res) {
  return res.status(400).send(
    buildActionResultPage({
      heading: 'Link Invalid or Expired',
      message:
        'This approval link is invalid, has expired, or has already been used. ' +
        'If the request is still pending, you can review it from the Admin Dashboard instead.',
      variant: 'error',
    })
  );
}

/**
 * Loads and validates a token from the query string, returning either the
 * matching record or null (in which case the caller should render the
 * generic invalid/expired page — deliberately not distinguishing "wrong
 * token" from "expired" from "already used" to a client we don't trust).
 */
async function loadValidToken(req) {
  const { token } = req.query;
  if (!token || typeof token !== 'string') {
    return null;
  }

  const tokenHash = hashAdminApprovalToken(token);
  const record = await userModel.findAdminApprovalToken(tokenHash);
  if (!record) return null;

  if (record.usedAt) return null;
  if (new Date(record.expiresAt) < new Date()) return null;
  if (!record.user || record.user.role !== 'admin' || record.user.approval_status !== 'pending') {
    return null;
  }

  return record;
}

/**
 * GET /api/admin-registration/approve?token=...
 * One-click approval link from the admin-notification email.
 * No authentication required — the possession of a valid, unexpired,
 * unused token IS the authorization (same trust model as password reset).
 */
async function approveByToken(req, res) {
  try {
    const record = await loadValidToken(req);
    if (!record) return invalidTokenPage(res);

    const result = await userModel.approveAdminByToken(record.id, record.userId);
    if (!result.ok) return invalidTokenPage(res);

    try {
      await sendAdminApprovedEmail({ to: result.user.email, fullName: result.user.full_name });
    } catch (emailErr) {
      console.error('approveByToken: failed to send approval email to user:', emailErr);
    }

    return res.status(200).send(
      buildActionResultPage({
        heading: 'Admin Account Approved',
        message: `The admin account has been approved successfully. ${escapeName(
          result.user.full_name
        )} can now log in to ${BRAND_NAME}.`,
        variant: 'success',
      })
    );
  } catch (err) {
    console.error('approveByToken error:', err);
    return res.status(500).send(
      buildActionResultPage({
        heading: 'Something Went Wrong',
        message: 'We could not process this request right now. Please try again from the Admin Dashboard.',
        variant: 'error',
      })
    );
  }
}

/**
 * GET /api/admin-registration/reject?token=...
 * One-click rejection link from the admin-notification email.
 */
async function rejectByToken(req, res) {
  try {
    const record = await loadValidToken(req);
    if (!record) return invalidTokenPage(res);

    const result = await userModel.rejectAdminByToken(record.id, record.userId);
    if (!result.ok) return invalidTokenPage(res);

    try {
      await sendAdminRejectedEmail({ to: result.user.email, fullName: result.user.full_name });
    } catch (emailErr) {
      console.error('rejectByToken: failed to send rejection email to user:', emailErr);
    }

    return res.status(200).send(
      buildActionResultPage({
        heading: 'Admin Request Rejected',
        message: 'The admin request has been rejected. The applicant has been notified by email.',
        variant: 'rejected',
      })
    );
  } catch (err) {
    console.error('rejectByToken error:', err);
    return res.status(500).send(
      buildActionResultPage({
        heading: 'Something Went Wrong',
        message: 'We could not process this request right now. Please try again from the Admin Dashboard.',
        variant: 'error',
      })
    );
  }
}

function escapeName(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = { approveByToken, rejectByToken };
