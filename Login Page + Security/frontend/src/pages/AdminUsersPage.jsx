import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchUsers, updateUser, deleteUser } from '../services/userService';

export default function AdminUsersPage() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(null);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await fetchUsers({ search, page, limit: 10 });
      setUsers(data.users);
      setPagination(data.pagination);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load users.');
    } finally {
      setIsLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function handleToggleActive(user) {
    try {
      await updateUser(user.id, { isActive: !user.is_active });
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user status.');
    }
  }

  async function handleRoleChange(user, role) {
    try {
      await updateUser(user.id, { role });
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update role.');
    }
  }

  async function handleDelete() {
    if (!confirmDeleteUser) return;
    try {
      await deleteUser(confirmDeleteUser.id);
      setConfirmDeleteUser(null);
      loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user.');
      setConfirmDeleteUser(null);
    }
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-eyebrow">Administration</div>
        <h1 className="page-title">User management</h1>
        <p className="page-subtitle">
          Search, edit, and manage every registered account. Role and status changes take effect
          immediately.
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">All accounts ({pagination.total ?? 0})</h2>
          <input
            className="search-input"
            type="text"
            placeholder="Search name, username, email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {isLoading ? (
          <div className="loading-row">
            <span className="spinner" /> Loading users...
          </div>
        ) : users.length === 0 ? (
          <div className="empty-state">No users match your search.</div>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.full_name}</td>
                    <td>{u.username}</td>
                    <td>{u.email}</td>
                    <td>
                      <select
                        value={u.role}
                        disabled={u.id === currentUser.id}
                        onChange={(e) => handleRoleChange(u, e.target.value)}
                        style={{ padding: '6px 10px', fontSize: 12 }}
                      >
                        <option value="admin">Admin</option>
                        <option value="user">User</option>
                        <option value="guest">Guest</option>
                      </select>
                    </td>
                    <td>
                      <span className={`status-dot ${u.is_active ? '' : 'inactive'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{new Date(u.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleToggleActive(u)}
                          disabled={u.id === currentUser.id}
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => setConfirmDeleteUser(u)}
                          disabled={u.id === currentUser.id}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="pagination">
              <button
                className="btn btn-ghost btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span style={{ alignSelf: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                Page {page} of {pagination.totalPages || 1}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={page >= (pagination.totalPages || 1)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>

      {confirmDeleteUser && (
        <div className="modal-backdrop" onClick={() => setConfirmDeleteUser(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', marginTop: 0 }}>Delete account?</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              This will permanently delete <strong>{confirmDeleteUser.full_name}</strong>'s
              account. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => setConfirmDeleteUser(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete}>
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
