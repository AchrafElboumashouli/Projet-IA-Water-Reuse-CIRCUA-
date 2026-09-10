import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../services/authService';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [serverError, setServerError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(e) {
    setEmail(e.target.value);
    setFieldError('');
  }

  function validate() {
    if (!email.trim()) return 'Email is required.';
    if (!EMAIL_REGEX.test(email.trim())) return 'Enter a valid email address.';
    return '';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError('');
    setSuccessMessage('');

    const validationError = validate();
    if (validationError) {
      setFieldError(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const data = await forgotPassword({ email: email.trim() });
      setSuccessMessage(
        data.message || "If an account exists, a password reset email has been sent."
      );
    } catch (err) {
      setServerError(
        err.response?.data?.error || 'Something went wrong. Please try again.'
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

      <h1 className="auth-heading">Forgot Password</h1>
      <p className="auth-lede">
        Enter your email address and we'll send you a link to reset your password.
      </p>

      {serverError && <div className="alert alert-error">{serverError}</div>}
      {successMessage && <div className="alert alert-success">{successMessage}</div>}

      {!successMessage && (
        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">Email</label>

            <div className="input-wrap">
              <span className="input-icon" aria-hidden="true">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M3 7l9 6 9-6" />
                </svg>
              </span>

              <input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={handleChange}
                placeholder="you@example.com"
                autoComplete="email"
                className={fieldError ? 'has-error' : ''}
              />
            </div>
            {fieldError && <div className="field-error">{fieldError}</div>}
          </div>

          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting && <span className="spinner" />}
            {isSubmitting ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>
      )}

      <div className="form-footer">
        <Link to="/login">Back to Login</Link>
      </div>
    </div>
  );
}
