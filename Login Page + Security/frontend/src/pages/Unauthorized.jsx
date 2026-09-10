import { Link } from 'react-router-dom';

export default function Unauthorized() {
  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="auth-eyebrow" style={{ justifyContent: 'center' }}>
          <span className="dial" /> ACCESS DENIED
        </div>
        <h1 className="auth-title">403 — Restricted</h1>
        <p className="auth-subtitle">
          Your account's clearance level doesn't include this area. If you believe this is a
          mistake, contact an administrator.
        </p>
        <Link to="/dashboard" className="btn btn-primary">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
