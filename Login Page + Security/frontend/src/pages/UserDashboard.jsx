import { useAuth } from '../context/AuthContext';

export default function UserDashboard() {
  const { currentUser } = useAuth();

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-eyebrow">Clearance Level · User</div>
        <h1 className="page-title">Welcome back, {currentUser?.full_name?.split(' ')[0]}</h1>
        <p className="page-subtitle">
          You have standard access to the application. Visit your profile to update your details.
        </p>
      </div>

      <div className="grid-cards">
        <div className="stat-card">
          <div className="label">Your role</div>
          <div className="value">User</div>
        </div>
        <div className="stat-card">
          <div className="label">Member since</div>
          <div className="value">
            {currentUser?.created_at ? new Date(currentUser.created_at).toLocaleDateString() : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Last login</div>
          <div className="value">
            {currentUser?.last_login ? new Date(currentUser.last_login).toLocaleString() : 'First login'}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">What you can do</h2>
        </div>
        <ul style={{ color: 'var(--text-muted)', lineHeight: 2, paddingLeft: 18 }}>
          <li>View and edit your own profile</li>
          <li>Access standard dashboard features</li>
          <li>Change your password securely</li>
        </ul>
      </div>
    </div>
  );
}
