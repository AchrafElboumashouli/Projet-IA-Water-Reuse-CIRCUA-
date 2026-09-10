import { useAuth } from '../context/AuthContext';

export default function GuestDashboard() {
  const { currentUser } = useAuth();

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-eyebrow">Clearance Level · Guest</div>
        <h1 className="page-title">Hello, {currentUser?.full_name?.split(' ')[0]}</h1>
        <p className="page-subtitle">
          Guest accounts have limited access. Contact an administrator if you need elevated
          permissions.
        </p>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">Available to you</h2>
        </div>
        <ul style={{ color: 'var(--text-muted)', lineHeight: 2, paddingLeft: 18 }}>
          <li>View your own profile</li>
          <li>Browse publicly available areas of the app</li>
        </ul>
      </div>
    </div>
  );
}
