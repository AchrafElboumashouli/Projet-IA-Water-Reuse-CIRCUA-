const userModel = require('../models/userModel');

async function listUsers(req, res) {
  try {
    const search = req.query.search ? String(req.query.search) : undefined;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;

    const [users, total] = await Promise.all([
      userModel.listUsers({ search, limit, offset }),
      userModel.countUsers({ search }),
    ]);

    return res.json({
      users,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('listUsers error:', err);
    return res.status(500).json({ error: 'Failed to fetch users.' });
  }
}

async function getUser(req, res) {
  try {
    const { id } = req.params;

    // Users may fetch their own profile; only admins may fetch others.
    if (req.user.role !== 'admin' && String(req.user.id) !== String(id)) {
      return res.status(403).json({ error: 'You cannot view this profile.' });
    }

    const user = await userModel.findById(id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    return res.json({ user });
  } catch (err) {
    console.error('getUser error:', err);
    return res.status(500).json({ error: 'Failed to fetch user.' });
  }
}

async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const isSelf = String(req.user.id) === String(id);
    const isAdmin = req.user.role === 'admin';

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: 'You cannot modify this user.' });
    }

    const fields = {};
    const { fullName, username, email, role, isActive } = req.body;

    if (fullName !== undefined) fields.full_name = fullName;
    if (username !== undefined) fields.username = username;
    if (email !== undefined) fields.email = email;

    // Only admins may change role or active status — never trust the
    // frontend/self-submitted role for privilege changes.
    if (role !== undefined) {
      if (!isAdmin) {
        return res.status(403).json({ error: 'Only admins can change roles.' });
      }
      fields.role = role;
    }
    if (isActive !== undefined) {
      if (!isAdmin) {
        return res.status(403).json({ error: 'Only admins can change account status.' });
      }
      fields.is_active = isActive;
    }

    if (email) {
      const existing = await userModel.findByEmail(email);
      if (existing && String(existing.id) !== String(id)) {
        return res.status(409).json({ error: 'Email already in use.' });
      }
    }
    if (username) {
      const existing = await userModel.findByUsername(username);
      if (existing && String(existing.id) !== String(id)) {
        return res.status(409).json({ error: 'Username already in use.' });
      }
    }

    const updated = await userModel.updateUser(id, fields);
    if (!updated) return res.status(404).json({ error: 'User not found.' });

    return res.json({ message: 'User updated successfully.', user: updated });
  } catch (err) {
    console.error('updateUser error:', err);
    return res.status(500).json({ error: 'Failed to update user.' });
  }
}

async function deleteUser(req, res) {
  try {
    const { id } = req.params;

    if (String(req.user.id) === String(id)) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }

    const deleted = await userModel.deleteUser(id);
    if (!deleted) return res.status(404).json({ error: 'User not found.' });

    return res.json({ message: 'User deleted successfully.' });
  } catch (err) {
    console.error('deleteUser error:', err);
    return res.status(500).json({ error: 'Failed to delete user.' });
  }
}

module.exports = { listUsers, getUser, updateUser, deleteUser };
