const express = require('express');
const { body } = require('express-validator');

const userController = require('../controllers/userController');
const adminController = require('../controllers/adminController');
const validateRequest = require('../middleware/validateRequest');
const { requireAuth, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// All user routes require authentication.
router.use(requireAuth);

// Only admins may list all users.
router.get('/', requireRole('admin'), userController.listUsers);

// Admin-approval workflow: only existing approved admins may view/approve/
// reject pending admin requests. Placed before '/:id' so it isn't shadowed
// by the generic id route below.
router.get('/admin-requests/pending', requireRole('admin'), adminController.listPendingAdmins);
router.post('/admin-requests/:id/approve', requireRole('admin'), adminController.approveAdmin);
router.post(
  '/admin-requests/:id/reject',
  requireRole('admin'),
  [body('reason').optional().isString().isLength({ max: 500 })],
  validateRequest,
  adminController.rejectAdmin
);

// A user may view their own profile; admins may view anyone (checked in controller).
router.get('/:id', userController.getUser);

// A user may edit their own basic info; only admins may change role/status (checked in controller).
router.patch(
  '/:id',
  [
    body('email').optional().isEmail().withMessage('Invalid email.').normalizeEmail(),
    body('username')
      .optional()
      .isLength({ min: 3, max: 50 })
      .matches(/^[a-zA-Z0-9_.-]+$/)
      .withMessage('Invalid username format.'),
    body('role').optional().isIn(['admin', 'user', 'guest']).withMessage('Invalid role.'),
    body('isActive').optional().isBoolean().withMessage('isActive must be boolean.'),
  ],
  validateRequest,
  userController.updateUser
);

// Only admins may delete users.
router.delete('/:id', requireRole('admin'), userController.deleteUser);

module.exports = router;
