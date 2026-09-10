import { useState } from 'react';

export default function PasswordInput({ id, value, onChange, placeholder, hasError, autoComplete }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="input-wrap">
      <input
        id={id}
        name={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={hasError ? 'has-error' : ''}
        autoComplete={autoComplete || 'current-password'}
      />
      <button
        type="button"
        className="toggle-visibility"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? 'HIDE' : 'SHOW'}
      </button>
    </div>
  );
}
