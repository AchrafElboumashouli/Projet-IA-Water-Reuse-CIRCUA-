import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { updateUser } from '../services/userService';

export default function UserProfile() {
  const { currentUser, refreshUser } = useAuth();
  const [form, setForm] = useState({
    fullName: currentUser?.full_name || '',
    username: currentUser?.username || '',
    email: currentUser?.email || '',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsSubmitting(true);
    try {
      await updateUser(currentUser.id, form);
      await refreshUser();
      setMessage('Profile updated successfully.');
    } catch (err) {
      setError(err.response?.data?.error || 'Unable to update profile.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-eyebrow">Account</div>
        <h1 className="page-title">Your profile</h1>
        <p className="page-subtitle">Update your personal information below.</p>
      </div>

      <div className="panel" style={{ maxWidth: 480 }}>
        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="fullName">Full name</label>
            <input id="fullName" name="fullName" type="text" value={form.fullName} onChange={handleChange} />
          </div>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input id="username" name="username" type="text" value={form.username} onChange={handleChange} />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" value={form.email} onChange={handleChange} />
          </div>
          <div className="field">
            <label>Role</label>
            <input type="text" value={currentUser?.role || ''} disabled />
          </div>

          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting && <span className="spinner" />}
            {isSubmitting ? 'Saving...' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  );
}
