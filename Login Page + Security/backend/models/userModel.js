const pool = require('../config/db');

// NOTE: every query below uses parameterized placeholders ($1, $2, ...)
// so user input is never concatenated into SQL, preventing SQL injection.

const PUBLIC_COLUMNS = `
  id, full_name, username, email, role, is_active, approval_status,
  approved_at, approved_by, created_at, updated_at, last_login
`;

async function findByEmailOrUsername(identifier) {
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE email = $1 OR username = $1 LIMIT 1`,
    [identifier]
  );
  return rows[0] || null;
}

async function findByEmail(email) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
  return rows[0] || null;
}

async function findByUsername(username) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE username = $1`, [username]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function findByIdWithPassword(id) {
  const { rows } = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function createUser({ fullName, username, email, passwordHash, role, approvalStatus = 'approved' }) {
  const { rows } = await pool.query(
    `INSERT INTO users (full_name, username, email, password_hash, role, approval_status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${PUBLIC_COLUMNS}`,
    [fullName, username, email, passwordHash, role, approvalStatus]
  );
  return rows[0];
}

async function updateLastLogin(id) {
  await pool.query(`UPDATE users SET last_login = NOW() WHERE id = $1`, [id]);
}

async function listUsers({ search, limit = 20, offset = 0 }) {
  let query = `SELECT ${PUBLIC_COLUMNS} FROM users`;
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    query += ` WHERE full_name ILIKE $1 OR username ILIKE $1 OR email ILIKE $1`;
  }

  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const { rows } = await pool.query(query, params);
  return rows;
}

async function countUsers({ search }) {
  let query = `SELECT COUNT(*)::int AS count FROM users`;
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    query += ` WHERE full_name ILIKE $1 OR username ILIKE $1 OR email ILIKE $1`;
  }
  const { rows } = await pool.query(query, params);
  return rows[0].count;
}

async function updateUser(id, fields) {
  const allowed = ['full_name', 'username', 'email', 'role', 'is_active'];
  const sets = [];
  const params = [];
  let idx = 1;

  for (const key of allowed) {
    if (fields[key] !== undefined) {
      sets.push(`${key} = $${idx}`);
      params.push(fields[key]);
      idx += 1;
    }
  }

  if (sets.length === 0) {
    return findById(id);
  }

  params.push(id);
  const { rows } = await pool.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING ${PUBLIC_COLUMNS}`,
    params
  );
  return rows[0] || null;
}

async function deleteUser(id) {
  const { rowCount } = await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
  return rowCount > 0;
}

// ---------- Admin approval workflow ----------

/**
 * Lists all accounts currently waiting on admin approval (role='admin' and
 * approval_status='pending'), oldest request first so the queue is processed
 * in order.
 */
async function listPendingAdmins() {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users
     WHERE role = 'admin' AND approval_status = 'pending'
     ORDER BY created_at ASC`
  );
  return rows;
}

async function findPendingAdminById(id) {
  const { rows } = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users
     WHERE id = $1 AND role = 'admin' AND approval_status = 'pending'`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Approves a pending admin account: flips approval_status/is_active and
 * records who approved it and when, atomically.
 */
async function approveAdmin(id, approverId) {
  const { rows } = await pool.query(
    `UPDATE users
     SET approval_status = 'approved',
         is_active = TRUE,
         approved_at = NOW(),
         approved_by = $2,
         rejected_reason = NULL
     WHERE id = $1 AND role = 'admin' AND approval_status = 'pending'
     RETURNING ${PUBLIC_COLUMNS}`,
    [id, approverId]
  );
  return rows[0] || null;
}

/**
 * Rejects a pending admin account. Account stays inactive; login remains
 * blocked (see authController.login).
 */
async function rejectAdmin(id, reason) {
  const { rows } = await pool.query(
    `UPDATE users
     SET approval_status = 'rejected',
         is_active = FALSE,
         rejected_reason = $2
     WHERE id = $1 AND role = 'admin' AND approval_status = 'pending'
     RETURNING ${PUBLIC_COLUMNS}`,
    [id, reason || null]
  );
  return rows[0] || null;
}

// ---------- Admin approval tokens (one-click email approve/reject) ----------

/**
 * Stores a newly issued admin-approval token (hash only) for a pending
 * admin user, with its expiration time.
 */
async function createAdminApprovalToken(userId, tokenHash, expiresAt) {
  const { rows } = await pool.query(
    `INSERT INTO admin_approval_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, token_hash, expires_at, used_at, created_at`,
    [userId, tokenHash, expiresAt]
  );
  return rows[0];
}

/**
 * Looks up a token by its hash together with the user it belongs to.
 * Does not itself check expiry/used status; callers must verify those
 * explicitly so the caller can return distinct "expired" vs "already used"
 * vs "invalid" error pages.
 */
async function findAdminApprovalToken(tokenHash) {
  const { rows } = await pool.query(
    `SELECT t.id, t.user_id, t.token_hash, t.expires_at, t.used_at, t.created_at,
            ${PUBLIC_COLUMNS.split(',').map((c) => `u.${c.trim()} AS user_${c.trim()}`).join(', ')}
     FROM admin_approval_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1`,
    [tokenHash]
  );
  if (!rows[0]) return null;

  const row = rows[0];
  const user = {};
  for (const col of PUBLIC_COLUMNS.split(',').map((c) => c.trim())) {
    user[col] = row[`user_${col}`];
  }

  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
    user,
  };
}

/**
 * Atomically approves a pending admin account and marks the approval token
 * as used, in a single transaction with a row lock, so a token can never be
 * used twice even under concurrent/duplicate clicks (e.g. email link
 * pre-fetching by security scanners).
 */
async function approveAdminByToken(tokenId, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the token row and re-check it hasn't been used/expired since it
    // was first read, closing the race window between check and update.
    const { rows: tokenRows } = await client.query(
      `SELECT id, expires_at, used_at FROM admin_approval_tokens WHERE id = $1 FOR UPDATE`,
      [tokenId]
    );
    const token = tokenRows[0];
    if (!token || token.used_at || new Date(token.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return { ok: false };
    }

    const { rows: userRows } = await client.query(
      `UPDATE users
       SET approval_status = 'approved',
           is_active = TRUE,
           approved_at = NOW(),
           rejected_reason = NULL
       WHERE id = $1 AND role = 'admin' AND approval_status = 'pending'
       RETURNING ${PUBLIC_COLUMNS}`,
      [userId]
    );

    if (!userRows[0]) {
      await client.query('ROLLBACK');
      return { ok: false };
    }

    await client.query(`UPDATE admin_approval_tokens SET used_at = NOW() WHERE id = $1`, [
      tokenId,
    ]);

    await client.query('COMMIT');
    return { ok: true, user: userRows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Atomically rejects a pending admin account and marks the approval token
 * as used, mirroring approveAdminByToken above.
 */
async function rejectAdminByToken(tokenId, userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: tokenRows } = await client.query(
      `SELECT id, expires_at, used_at FROM admin_approval_tokens WHERE id = $1 FOR UPDATE`,
      [tokenId]
    );
    const token = tokenRows[0];
    if (!token || token.used_at || new Date(token.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return { ok: false };
    }

    const { rows: userRows } = await client.query(
      `UPDATE users
       SET approval_status = 'rejected',
           is_active = FALSE
       WHERE id = $1 AND role = 'admin' AND approval_status = 'pending'
       RETURNING ${PUBLIC_COLUMNS}`,
      [userId]
    );

    if (!userRows[0]) {
      await client.query('ROLLBACK');
      return { ok: false };
    }

    await client.query(`UPDATE admin_approval_tokens SET used_at = NOW() WHERE id = $1`, [
      tokenId,
    ]);

    await client.query('COMMIT');
    return { ok: true, user: userRows[0] };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ---------- Password reset ----------

/**
 * Stores a hashed reset token + expiry for a user.
 * Overwrites any previously issued token, which automatically invalidates it
 * (only the most recently issued token can ever be valid).
 */
async function setResetToken(id, tokenHash, expiresAt) {
  await pool.query(
    `UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3`,
    [tokenHash, expiresAt, id]
  );
}

/**
 * Looks up a user by their hashed reset token.
 * Does not itself check expiry; callers must verify reset_token_expiry.
 */
async function findByResetTokenHash(tokenHash) {
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE reset_token = $1`,
    [tokenHash]
  );
  return rows[0] || null;
}

/**
 * Clears the reset token so it can never be reused (single-use tokens).
 */
async function clearResetToken(id) {
  await pool.query(
    `UPDATE users SET reset_token = NULL, reset_token_expiry = NULL WHERE id = $1`,
    [id]
  );
}

/**
 * Updates a user's password hash. Does not touch the reset token columns;
 * callers are expected to clear the token separately (kept explicit/atomic
 * at the call site inside a transaction).
 */
async function updatePasswordHash(id, passwordHash) {
  await pool.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, id]);
}

/**
 * Atomically updates the password and invalidates the reset token in a single
 * transaction, so the token can never be used twice even under concurrent requests.
 */
async function resetPasswordTransaction(id, passwordHash) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, id]);
    await client.query(
      `UPDATE users SET reset_token = NULL, reset_token_expiry = NULL WHERE id = $1`,
      [id]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  findByEmailOrUsername,
  findByEmail,
  findByUsername,
  findById,
  findByIdWithPassword,
  createUser,
  updateLastLogin,
  listUsers,
  countUsers,
  updateUser,
  deleteUser,
  listPendingAdmins,
  findPendingAdminById,
  approveAdmin,
  rejectAdmin,
  createAdminApprovalToken,
  findAdminApprovalToken,
  approveAdminByToken,
  rejectAdminByToken,
  setResetToken,
  findByResetTokenHash,
  clearResetToken,
  updatePasswordHash,
  resetPasswordTransaction,
};
