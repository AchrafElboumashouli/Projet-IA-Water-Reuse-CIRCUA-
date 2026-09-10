import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchPendingAdmins,
  approveAdminRequest,
  rejectAdminRequest,
} from '../services/userService';

function PendingAdminRequests() {
  const [pending, setPending] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioningId, setActioningId] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await fetchPendingAdmins();
      setPending(data.pending || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load pending admin requests.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleApprove(id) {
    setActioningId(id);
    try {
      await approveAdminRequest(id);
      setPending((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to approve request.');
    } finally {
      setActioningId(null);
    }
  }

  async function handleReject(id) {
    setActioningId(id);
    try {
      await rejectAdminRequest(id);
      setPending((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reject request.');
    } finally {
      setActioningId(null);
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">Pending Admin Requests</h2>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {isLoading ? (
        <div className="loading-row">
          <span className="spinner" /> Loading pending requests...
        </div>
      ) : pending.length === 0 ? (
        <div className="empty-state">No pending admin requests.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Email</th>
              <th>Registration Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pending.map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}</td>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td>{new Date(u.created_at).toLocaleDateString()}</td>
                <td>
                  <div className="table-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={actioningId === u.id}
                      onClick={() => handleApprove(u.id)}
                    >
                      Approve
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      disabled={actioningId === u.id}
                      onClick={() => handleReject(u.id)}
                    >
                      Reject
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { currentUser } = useAuth();

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-eyebrow">Clearance Level · Admin</div>
        <h1 className="page-title">Welcome, {currentUser?.full_name?.split(' ')[0]}</h1>
        <p className="page-subtitle">
          You have full administrative access: manage accounts, roles, and system-wide settings.
        </p>
      </div>

      <div className="grid-cards">
        <div className="stat-card">
          <div className="label">Your role</div>
          <div className="value">Admin</div>
        </div>
        <div className="stat-card">
          <div className="label">Account status</div>
          <div className="value">Active</div>
        </div>
        <div className="stat-card">
          <div className="label">Manage users</div>
          <div className="value">
            <a href="/admin/users" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              Open →
            </a>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Administrative capabilities</h2>
        </div>
        <ul style={{ color: 'var(--text-muted)', lineHeight: 2, paddingLeft: 18 }}>
          <li>Search and review every registered account</li>
          <li>Edit user details, including email and username</li>
          <li>Promote or demote roles between admin, user, and guest</li>
          <li>Activate or deactivate accounts</li>
          <li>Permanently delete accounts</li>
        </ul>
      </div>

      <PendingAdminRequests />
    </div>
  );
}
