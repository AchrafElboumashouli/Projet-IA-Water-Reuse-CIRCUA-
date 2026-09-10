import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PasswordInput from './PasswordInput';
import { resetPassword } from '../services/authService';

function validate(form) {
  const errors = {};
  if (form.password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }
  if (form.confirmPassword !== form.password) {
    errors.confirmPassword = 'Passwords do not match.';
  }
  return errors;
}

export default function ResetPasswordForm() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError('');
    setSuccessMessage('');

    const validationErrors = validate(form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setIsSubmitting(true);
    try {
      const data = await resetPassword({ token, password: form.password });
      setSuccessMessage(data.message || 'Your password has been reset successfully.');
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2000);
    } catch (err) {
      setServerError(
        err.response?.data?.error || 'Unable to reset password. The link may be invalid or expired.'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-left-inner">
      <div className="brand-row">
        <span className="logo-mark">👤</span>
        <span className="logo-text">CIRCUA</span>
      </div>

      <h1 className="auth-heading">Reset Password</h1>
      <p className="auth-lede">Choose a new password for your account.</p>

      {serverError && <div className="alert alert-error">{serverError}</div>}
      {successMessage && (
        <div className="alert alert-success">
          {successMessage} Redirecting to login...
        </div>
      )}

      {!successMessage && (
        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="password">New Password</label>
            <div className="input-wrap">
              <span className="input-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="4" y="10" width="16" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 018 0v3" />
                </svg>
              </span>
              <PasswordInput
                id="password"
                value={form.password}
                onChange={handleChange}
                placeholder="••••••••"
                autoComplete="new-password"
                hasError={Boolean(errors.password)}
              />
            </div>
            {errors.password && <div className="field-error">{errors.password}</div>}
          </div>

          <div className="field">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <div className="input-wrap">
              <span className="input-icon" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="4" y="10" width="16" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 018 0v3" />
                </svg>
              </span>
              <PasswordInput
                id="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
                autoComplete="new-password"
                hasError={Boolean(errors.confirmPassword)}
              />
            </div>
            {errors.confirmPassword && (
              <div className="field-error">{errors.confirmPassword}</div>
            )}
          </div>

          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting && <span className="spinner" />}
            {isSubmitting ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      )}

      <div className="form-footer">
        <Link to="/login">Back to Login</Link>
      </div>
    </div>
  );
}
