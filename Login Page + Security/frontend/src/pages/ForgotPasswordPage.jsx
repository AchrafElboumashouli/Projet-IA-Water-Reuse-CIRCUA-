import ForgotPasswordForm from '../components/ForgotPasswordForm';
import AuthIllustration from '../components/AuthIllustration';

export default function ForgotPasswordPage() {
  return (
    <div className="auth-split-page">
      <div className="auth-left">
        <ForgotPasswordForm />
      </div>
      <div className="auth-right">
        <AuthIllustration />
      </div>
    </div>
  );
}
