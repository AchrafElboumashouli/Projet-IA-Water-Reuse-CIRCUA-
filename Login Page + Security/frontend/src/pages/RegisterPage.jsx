import RegisterForm from '../components/RegisterForm';
import AuthIllustration from '../components/AuthIllustration';

export default function RegisterPage() {
  return (
    <div className="auth-split-page">
      <div className="auth-left">
        <RegisterForm />
      </div>
      <div className="auth-right">
        <AuthIllustration />
      </div>
    </div>
  );
}
