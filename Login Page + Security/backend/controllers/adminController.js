const userModel = require('../models/userModel');
const {
  sendAdminApprovedEmail,
  sendAdminRejectedEmail,
} = require('../services/emailService');

/**
 * Lists accounts awaiting admin approval. Gated by requireRole('admin') at
 * the route level.
 */
async function listPendingAdmins(req, res) {
  try {
    const pending = await userModel.listPendingAdmins();
    return res.json({ pending });
  } catch (err) {
    console.error('listPendingAdmins error:', err);
    return res.status(500).json({ error: 'Failed to fetch pending admin requests.' });
  }
}

/**
 * Approves a pending admin request: activates the account and notifies the
 * requesting user by email.
 */
async function approveAdmin(req, res) {
  try {
    const { id } = req.params;

    const target = await userModel.findPendingAdminById(id);
    if (!target) {
      return res.status(404).json({ error: 'Pending admin request not found.' });
    }

    const approved = await userModel.approveAdmin(id, req.user.id);
    if (!approved) {
      return res.status(404).json({ error: 'Pending admin request not found.' });
    }

    try {
      await sendAdminApprovedEmail({ to: approved.email, fullName: approved.full_name });
    } catch (emailErr) {
      // The approval itself already succeeded; a failed notification email
      // shouldn't roll that back or fail the request.
      console.error('approveAdmin: failed to send approval email:', emailErr);
    }

    return res.json({ message: 'Admin request approved.', user: approved });
  } catch (err) {
    console.error('approveAdmin error:', err);
    return res.status(500).json({ error: 'Failed to approve admin request.' });
  }
}

/**
 * Rejects a pending admin request and notifies the requesting user by email.
 */
async function rejectAdmin(req, res) {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const target = await userModel.findPendingAdminById(id);
    if (!target) {
      return res.status(404).json({ error: 'Pending admin request not found.' });
    }

    const rejected = await userModel.rejectAdmin(id, reason);
    if (!rejected) {
      return res.status(404).json({ error: 'Pending admin request not found.' });
    }

    try {
      await sendAdminRejectedEmail({
        to: rejected.email,
        fullName: rejected.full_name,
        reason,
      });
    } catch (emailErr) {
      console.error('rejectAdmin: failed to send rejection email:', emailErr);
    }

    return res.json({ message: 'Admin request rejected.', user: rejected });
  } catch (err) {
    console.error('rejectAdmin error:', err);
    return res.status(500).json({ error: 'Failed to reject admin request.' });
  }
}

module.exports = { listPendingAdmins, approveAdmin, rejectAdmin };
