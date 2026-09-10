import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
  const { currentUser, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <nav className="navbar">
      <div className="brand">
        <span className="mark" aria-hidden="true" />
        CIRCUA
      </div>

      <div className="nav-links">
        {isAuthenticated ? (
          <>
            <NavLink to="/dashboard" className={({ isActive }) => (isActive ? 'active' : '')}>
              Dashboard
            </NavLink>
            <NavLink to="/profile" className={({ isActive }) => (isActive ? 'active' : '')}>
              Profile
            </NavLink>
            {currentUser?.role === 'admin' && (
              <NavLink to="/admin/users" className={({ isActive }) => (isActive ? 'active' : '')}>
                Admin
              </NavLink>
            )}
            <span className={`role-chip ${currentUser?.role}`}>{currentUser?.role}</span>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <NavLink to="/login" className={({ isActive }) => (isActive ? 'active' : '')}>
              Log in
            </NavLink>
            <NavLink to="/register" className="btn btn-primary btn-sm">
              Sign up
            </NavLink>
          </>
        )}
      </div>
    </nav>
  );
}
