import ResetPasswordForm from '../components/ResetPasswordForm';
import AuthIllustration from '../components/AuthIllustration';

export default function ResetPasswordPage() {
  return (
    <div className="auth-split-page">
      <div className="auth-left">
        <ResetPasswordForm />
      </div>
      <div className="auth-right">
        <AuthIllustration />
      </div>
    </div>
  );
}
