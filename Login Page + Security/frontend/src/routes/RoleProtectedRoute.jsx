import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Restricts a subtree of routes to specific roles.
 * NOTE: this is a UX convenience only. The backend independently
 * verifies the role on every protected API call, so hiding a route
 * here never substitutes for real authorization.
 */
export default function RoleProtectedRoute({ allowedRoles }) {
  const { currentUser, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="loading-row">
        <span className="spinner" /> Checking permissions...
      </div>
    );
  }

  if (!currentUser || !allowedRoles.includes(currentUser.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <Outlet />;
}
