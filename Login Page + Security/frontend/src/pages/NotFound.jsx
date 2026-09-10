import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="auth-eyebrow" style={{ justifyContent: 'center' }}>
          <span className="dial" /> NOT FOUND
        </div>
        <h1 className="auth-title">404 — Lost signal</h1>
        <p className="auth-subtitle">The page you're looking for doesn't exist.</p>
        <Link to="/" className="btn btn-primary">
          Return home
        </Link>
      </div>
    </div>
  );
}
