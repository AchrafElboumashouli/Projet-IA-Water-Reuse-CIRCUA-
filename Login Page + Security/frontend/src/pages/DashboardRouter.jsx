import { useAuth } from '../context/AuthContext';
import AdminDashboard from './AdminDashboard';
import UserDashboard from './UserDashboard';
import GuestDashboard from './GuestDashboard';

export default function DashboardRouter() {
  const { currentUser } = useAuth();

  if (currentUser?.role === 'admin') return <AdminDashboard />;
  if (currentUser?.role === 'guest') return <GuestDashboard />;
  return <UserDashboard />;
}
