import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PasswordInput from './PasswordInput';

const initialForm = {
  fullName: '',
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  role: 'user',
};

function validate(form) {
  const errors = {};
  if (form.fullName.trim().length < 2) errors.fullName = 'Enter your full name.';
  if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(form.username)) {
    errors.username = 'Use 3-50 characters: letters, numbers, _ . -';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email.';
  if (form.password.length < 8 || !/[A-Z]/.test(form.password) || !/[0-9]/.test(form.password)) {
    errors.password = 'At least 8 characters, one uppercase letter, one number.';
  }
  if (form.confirmPassword !== form.password) errors.confirmPassword = 'Passwords do not match.';
  return errors;
}

export default function RegisterForm() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState(initialForm);
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
      const data = await register(form);
      if (data?.pendingApproval) {
        setSuccessMessage(data.message);
        // No auto-login/redirect for pending admin requests — the account
        // isn't usable yet, so send the user back to the login page on
        // their own time rather than bouncing them there immediately.
      } else {
        setSuccessMessage('Account created! Redirecting you to log in...');
        setTimeout(() => navigate('/login'), 1200);
      }
    } catch (err) {
      const apiErr = err.response?.data;
      if (apiErr?.details) {
        const fieldErrors = {};
        apiErr.details.forEach((d) => {
          fieldErrors[d.field] = d.message;
        });
        setErrors(fieldErrors);
      }
      setServerError(apiErr?.error || 'Unable to create your account. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-left-inner">
      <div className="brand-row">
        <span className="logo-mark">🔒</span>
        <span className="logo-text">CIRCUA</span>
      </div>

      <h1 className="auth-heading">Create your Account</h1>
      <p className="auth-lede">Standard access by default — admin roles are granted separately.</p>

      {serverError && <div className="alert alert-error">{serverError}</div>}
      {successMessage && <div className="alert alert-success">{successMessage}</div>}

      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="fullName">Full name</label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            value={form.fullName}
            onChange={handleChange}
            placeholder="Jane Doe"
            className={errors.fullName ? 'has-error' : ''}
            autoComplete="name"
          />
          {errors.fullName && <div className="field-error">{errors.fullName}</div>}
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              type="text"
              value={form.username}
              onChange={handleChange}
              placeholder="janedoe"
              className={errors.username ? 'has-error' : ''}
              autoComplete="username"
            />
            {errors.username && <div className="field-error">{errors.username}</div>}
          </div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
              className={errors.email ? 'has-error' : ''}
              autoComplete="email"
            />
            {errors.email && <div className="field-error">{errors.email}</div>}
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="password">Password</label>

            <div className="password-wrapper">
              <span className="password-icon" aria-hidden="true">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="4" y="10" width="16" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 018 0v3" />
                </svg>
              </span>

              <PasswordInput
                id="password"
                value={form.password}
                onChange={handleChange}
                placeholder="••••••••"
                hasError={Boolean(errors.password)}
                autoComplete="new-password"
              />
            </div>

            {errors.password && (
              <div className="field-error">{errors.password}</div>
            )}
          </div>

                    <div className="field">
            <label htmlFor="confirmPassword">Confirm Password</label>

            <div className="password-wrapper">
              <span className="password-icon" aria-hidden="true">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="4" y="10" width="16" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 018 0v3" />
                </svg>
              </span>

              <PasswordInput
                id="confirmPassword"
                value={form.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
                hasError={Boolean(errors.confirmPassword)}
                autoComplete="new-password"
              />
            </div>

            {errors.confirmPassword && (
              <div className="field-error">{errors.confirmPassword}</div>
            )}
          </div>
        </div>

        <div className="field">
          <label htmlFor="role">Account type</label>
          <select id="role" name="role" value={form.role} onChange={handleChange}>
            <option value="user">User</option>
            <option value="guest">Guest</option>
            <option value="admin">Admin</option>
          </select>
          {form.role === 'admin' && (
            <div className="field-hint">
              Admin accounts require approval before you can log in.
            </div>
          )}
        </div>

        <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting && <span className="spinner" />}
          {isSubmitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <div className="form-footer">
        Already have an account? <Link to="/login">Log in</Link>
      </div>
    </div>
  );
}
