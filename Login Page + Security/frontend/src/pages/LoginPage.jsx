import LoginForm from '../components/LoginForm';
import AuthIllustration from '../components/AuthIllustration';

export default function LoginPage() {
  return (
    <div className="auth-split-page">
      <div className="auth-left">
        <LoginForm />
      </div>
      <div className="auth-right">
        <AuthIllustration />
      </div>
    </div>
  );
}
