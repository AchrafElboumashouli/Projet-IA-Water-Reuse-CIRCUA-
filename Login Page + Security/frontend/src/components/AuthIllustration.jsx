export default function AuthIllustration() {
  return (
    <>
      <div className="illustration-wrap">
      <svg viewBox="0 0 420 300" width="100%" height="auto">

  <circle cx="140" cy="150" r="120" fill="rgba(255,255,255,.05)" />
  <circle cx="140" cy="150" r="90" fill="rgba(255,255,255,.04)" />

  <line x1="140" y1="90" x2="140" y2="125" stroke="rgba(255,255,255,.25)" strokeWidth="2"/>
  <line x1="92" y1="155" x2="124" y2="145" stroke="rgba(255,255,255,.25)" strokeWidth="2"/>
  <line x1="140" y1="175" x2="140" y2="215" stroke="rgba(255,255,255,.25)" strokeWidth="2"/>

  <circle cx="140" cy="75" r="12" fill="#60A5FA"/>
  <circle cx="75" cy="160" r="12" fill="#60A5FA"/>
  <circle cx="140" cy="225" r="12" fill="#60A5FA"/>

  <path
      d="
      M140 95
      C118 122 108 138 108 160
      C108 180 122 196 140 196
      C158 196 172 180 172 160
      C172 138 162 122 140 95Z"
      fill="#38BDF8"/>

  <g transform="translate(235 30)">
      <circle cx="20" cy="30" r="16" fill="#dbeafe"/>
      <circle cx="40" cy="22" r="18" fill="#dbeafe"/>
      <circle cx="62" cy="30" r="16" fill="#dbeafe"/>
      <rect x="18" y="30" width="46" height="16" rx="8" fill="#dbeafe"/>
  </g>

  <rect
      x="205"
      y="70"
      width="170"
      height="170"
      rx="18"
      fill="#ffffff"/>

  <circle cx="222" cy="87" r="4" fill="#ef4444"/>
  <circle cx="236" cy="87" r="4" fill="#f59e0b"/>
  <circle cx="250" cy="87" r="4" fill="#10b981"/>

  <rect x="220" y="102" width="110" height="8" rx="4" fill="#E5E7EB"/>

  <circle cx="223" cy="130" r="8" fill="#0EA5E9"/>
  <rect x="238" y="126" width="72" height="6" rx="3" fill="#E5E7EB"/>

  <circle cx="223" cy="155" r="8" fill="#22C55E"/>
  <rect x="238" y="151" width="85" height="6" rx="3" fill="#E5E7EB"/>

  <circle cx="223" cy="180" r="8" fill="#F59E0B"/>
  <rect x="238" y="176" width="65" height="6" rx="3" fill="#E5E7EB"/>

  <polyline
      points="
      220,220
      238,205
      258,210
      278,190
      300,198
      320,175
      345,185"
      fill="none"
      stroke="#2563EB"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"/>

  <circle cx="238" cy="205" r="3" fill="#2563EB"/>
  <circle cx="258" cy="210" r="3" fill="#2563EB"/>
  <circle cx="278" cy="190" r="3" fill="#2563EB"/>
  <circle cx="300" cy="198" r="3" fill="#2563EB"/>
  <circle cx="320" cy="175" r="3" fill="#2563EB"/>
  <circle cx="345" cy="185" r="3" fill="#2563EB"/>

  <g transform="translate(330 115)">
      <path
          d="
          M10 25
          V18
          C10 10 16 5 22 5
          C28 5 34 10 34 18
          V25
          L38 30
          H6
          Z"
          fill="#F59E0B"/>

      <circle cx="22" cy="34" r="3" fill="#F59E0B"/>
  </g>

  <path
      d="
      M338 205
      L352 210
      L352 224
      C352 237 344 246 338 249
      C332 246 324 237 324 224
      L324 210
      Z"
      fill="#2563EB"/>

  <path
      d="
      M333 223
      L337 227
      L344 218"
      stroke="white"
      strokeWidth="2"
      fill="none"
      strokeLinecap="round"/>

</svg>
    </div>
      <div className="illustration-copy">
        <h3>Smart Water Quality Monitoring.</h3>
        <p>Monitor real-time water quality data, receive intelligent alerts, and analyze sensor measurements through a secure and interactive dashboard.</p>
      </div>
      <div className="illustration-dots">
        <span className="active" />
        <span />
        <span />
      </div>
    </>
  );
}
