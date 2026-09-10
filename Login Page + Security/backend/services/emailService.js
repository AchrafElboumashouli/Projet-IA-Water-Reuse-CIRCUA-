const nodemailer = require('nodemailer');

// Single shared transporter, configured entirely from environment variables.
// Credentials are never hardcoded anywhere in the codebase.
//
// Proxy support is optional: SMTP_PROXY is only used if it's actually set to
// a non-empty value after trimming. Unset, null, or empty (SMTP_PROXY= or
// commented out) all mean "connect directly" — nothing throws in that case,
// and no other email functionality changes either way. See PROXY_SETUP.md.
let transporter = null;

function resolveSmtpProxy() {
  const raw = process.env.SMTP_PROXY;
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildTransportConfig() {
  const config = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  };

  const proxy = resolveSmtpProxy();

  if (proxy) {
    console.log(`SMTP: Using proxy ${proxy}`);
    config.proxy = proxy;
  } else {
    console.log('SMTP: Using direct connection');
  }

  return { config, proxy };
}

function getTransporter() {
  if (transporter) return transporter;

  const { config, proxy } = buildTransportConfig();
  transporter = nodemailer.createTransport(config);

  // SOCKS proxies (socks:// / socks4:// / socks5://) need the "socks"
  // package registered on top of the base config; HTTP CONNECT proxies work
  // with Nodemailer's built-in support and need nothing extra. This never
  // creates a second transporter — same instance, just an added module.
  if (proxy && proxy.startsWith('socks')) {
    try {
      transporter.set('proxy_socks_module', require('socks'));
    } catch (err) {
      console.error(
        'SMTP: SMTP_PROXY is a socks:// URL but the "socks" package is not installed. ' +
          'Run "npm install socks" in backend/, or switch SMTP_PROXY to an http:// proxy. ' +
          'Falling back to attempting the connection without SOCKS support (it will likely fail).'
      );
    }
  }

  return transporter;
}

const BRAND_NAME = 'Smart Water Quality Monitoring';
const BRAND_COLOR = '#2563eb';
const BRAND_NAVY = '#0f172a';

/**
 * Builds the branded HTML body for the password reset email.
 * Kept inline (no external CSS) for maximum email-client compatibility.
 */
function buildResetPasswordHtml({ resetUrl, expiresInMinutes }) {
  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Reset Your Password</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f3f4f6; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding: 32px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius: 12px; overflow:hidden; box-shadow: 0 2px 8px rgba(15,23,42,0.08);">
              <tr>
                <td style="background-color:${BRAND_NAVY}; padding: 28px 32px;">
                  <span style="font-size:20px; font-weight:700; color:#ffffff; letter-spacing:-0.01em;">
                    💧 ${BRAND_NAME}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding: 32px;">
                  <h1 style="margin:0 0 16px; font-size:20px; color:#101828;">Reset your password</h1>
                  <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#374151;">
                    Hello,
                  </p>
                  <p style="margin:0 0 24px; font-size:14px; line-height:1.6; color:#374151;">
                    We received a request to reset the password for your ${BRAND_NAME} account.
                    Click the button below to choose a new password. This link is valid for
                    <strong>${expiresInMinutes} minutes</strong>.
                  </p>
                  <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 0 28px;">
                    <tr>
                      <td align="center" style="border-radius: 8px; background-color:${BRAND_COLOR};">
                        <a href="${resetUrl}"
                           style="display:inline-block; padding: 14px 28px; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:8px;">
                          Reset Password
                        </a>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0 0 8px; font-size:13px; line-height:1.6; color:#6b7280;">
                    If the button above doesn't work, copy and paste this link into your browser:
                  </p>
                  <p style="margin:0 0 24px; font-size:13px; line-height:1.6; word-break:break-all;">
                    <a href="${resetUrl}" style="color:${BRAND_COLOR};">${resetUrl}</a>
                  </p>
                  <p style="margin:0; font-size:13px; line-height:1.6; color:#9ca3af;">
                    If you didn't request a password reset, you can safely ignore this email —
                    your password will remain unchanged.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding: 20px 32px; background-color:#f9fafb; border-top:1px solid #eef0f4;">
                  <p style="margin:0; font-size:12px; color:#9ca3af;">
                    This is an automated message from ${BRAND_NAME}. Please do not reply to this email.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}

function buildResetPasswordText({ resetUrl, expiresInMinutes }) {
  return [
    `${BRAND_NAME} - Reset Your Password`,
    '',
    'We received a request to reset the password for your account.',
    `Open the link below to choose a new password (valid for ${expiresInMinutes} minutes):`,
    resetUrl,
    '',
    "If you didn't request this, you can safely ignore this email.",
  ].join('\n');
}

/**
 * Sends the password reset email.
 * Throws on SMTP failure so the caller can decide how to handle/log it.
 */
async function sendPasswordResetEmail({ to, resetUrl, expiresInMinutes = 15 }) {
  const mailer = getTransporter();

  await mailer.sendMail({
    from: process.env.SMTP_FROM || `"${BRAND_NAME}" <no-reply@smartwaterquality.local>`,
    to,
    subject: 'Reset Your Password',
    text: buildResetPasswordText({ resetUrl, expiresInMinutes }),
    html: buildResetPasswordHtml({ resetUrl, expiresInMinutes }),
  });
}

/**
 * Generic branded wrapper reused by the three admin-approval emails below,
 * so they stay visually consistent with the password reset email without
 * duplicating the whole HTML shell each time.
 */
function buildSimpleHtml({ heading, paragraphs }) {
  const body = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#374151;">${p}</p>`
    )
    .join('\n');

  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${heading}</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f3f4f6; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding: 32px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius: 12px; overflow:hidden; box-shadow: 0 2px 8px rgba(15,23,42,0.08);">
              <tr>
                <td style="background-color:${BRAND_NAVY}; padding: 28px 32px;">
                  <span style="font-size:20px; font-weight:700; color:#ffffff; letter-spacing:-0.01em;">
                    💧 ${BRAND_NAME}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding: 32px;">
                  <h1 style="margin:0 0 16px; font-size:20px; color:#101828;">${heading}</h1>
                  ${body}
                </td>
              </tr>
              <tr>
                <td style="padding: 20px 32px; background-color:#f9fafb; border-top:1px solid #eef0f4;">
                  <p style="margin:0; font-size:12px; color:#9ca3af;">
                    This is an automated message from ${BRAND_NAME}. Please do not reply to this email.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}

/**
 * Escapes HTML-sensitive characters so untrusted user-supplied fields
 * (full name, username, email) can never break out of the email markup or
 * inject arbitrary HTML/scripts into the admin's inbox.
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Builds the HTML for the admin-approval-request email, including the
 * one-click green Approve / red Reject buttons alongside the classic
 * "review from the Admin Dashboard" fallback link.
 */
function buildAdminApprovalRequestHtml({
  fullName,
  username,
  email,
  requestedRole,
  registeredAt,
  approveUrl,
  rejectUrl,
  expiresInHours,
}) {
  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>New Admin Registration Request</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f3f4f6; font-family: 'Segoe UI', Helvetica, Arial, sans-serif;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding: 32px 0;">
        <tr>
          <td align="center">
            <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius: 12px; overflow:hidden; box-shadow: 0 2px 8px rgba(15,23,42,0.08); max-width:480px; width:100%;">
              <tr>
                <td style="background-color:${BRAND_NAVY}; padding: 28px 32px;">
                  <span style="font-size:20px; font-weight:700; color:#ffffff; letter-spacing:-0.01em;">
                    💧 ${BRAND_NAME}
                  </span>
                </td>
              </tr>
              <tr>
                <td style="padding: 32px;">
                  <h1 style="margin:0 0 16px; font-size:20px; color:#101828;">New Admin Registration Request</h1>
                  <p style="margin:0 0 20px; font-size:14px; line-height:1.6; color:#374151;">
                    A new user has requested Admin access. Review the details below, then approve or
                    reject the request with one click — no login required.
                  </p>

                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px; background-color:#f9fafb; border:1px solid #eef0f4; border-radius:8px;">
                    <tr>
                      <td style="padding:16px 20px; font-size:13px; line-height:1.9; color:#374151;">
                        <strong>Full Name:</strong> ${escapeHtml(fullName)}<br/>
                        <strong>Username:</strong> ${escapeHtml(username)}<br/>
                        <strong>Email:</strong> ${escapeHtml(email)}<br/>
                        <strong>Registration Date:</strong> ${escapeHtml(registeredAt)}<br/>
                        <strong>Requested Role:</strong> ${escapeHtml(requestedRole)}
                      </td>
                    </tr>
                  </table>

                  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 0 0 20px;">
                    <tr>
                      <td align="center" style="padding: 0 8px 0 0; border-radius: 8px; background-color:#16a34a;">
                        <a href="${approveUrl}"
                           style="display:block; padding: 14px 20px; font-size:14px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:8px; text-align:center;">
                          ✅ Approve Request
                        </a>
                      </td>
                      <td style="width:12px; line-height:1px; font-size:1px;">&nbsp;</td>
                      <td align="center" style="padding: 0; border-radius: 8px; background-color:#dc2626;">
                        <a href="${rejectUrl}"
                           style="display:block; padding: 14px 20px; font-size:14px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:8px; text-align:center;">
                          ❌ Reject Request
                        </a>
                      </td>
                    </tr>
                  </table>

                  <p style="margin:0 0 8px; font-size:13px; line-height:1.6; color:#6b7280;">
                    These links are valid for <strong>${expiresInHours} hours</strong> and can each only be used once.
                  </p>
                  <p style="margin:0; font-size:13px; line-height:1.6; color:#9ca3af;">
                    Prefer to review first? You can also approve or reject this request any time from the
                    Admin Dashboard.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="padding: 20px 32px; background-color:#f9fafb; border-top:1px solid #eef0f4;">
                  <p style="margin:0; font-size:12px; color:#9ca3af;">
                    This is an automated message from ${BRAND_NAME}. Please do not reply to this email.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}

/**
 * Notifies the configured admin-approval inbox that a new admin account is
 * awaiting review. `to` is always read from config by the caller — never
 * hardcoded here. Includes one-click Approve/Reject buttons in addition to
 * the Admin Dashboard fallback.
 */
async function sendAdminApprovalRequestEmail({
  to,
  fullName,
  username,
  email,
  requestedRole,
  registeredAt,
  approveUrl,
  rejectUrl,
  expiresInHours = 24,
}) {
  const mailer = getTransporter();

  const text = [
    'New Admin Registration Request',
    '',
    'A new user has requested Admin access. Information:',
    `Full Name: ${fullName}`,
    `Username: ${username}`,
    `Email: ${email}`,
    `Registration Date: ${registeredAt}`,
    `Requested Role: ${requestedRole}`,
    '',
    `Approve: ${approveUrl}`,
    `Reject: ${rejectUrl}`,
    `(These links expire in ${expiresInHours} hours and can each be used once.)`,
    '',
    'You can also approve or reject this request from the Admin Dashboard.',
  ].join('\n');

  await mailer.sendMail({
    from: process.env.SMTP_FROM || `"${BRAND_NAME}" <no-reply@smartwaterquality.local>`,
    to,
    subject: 'New Admin Registration Request',
    text,
    html: buildAdminApprovalRequestHtml({
      fullName,
      username,
      email,
      requestedRole,
      registeredAt,
      approveUrl,
      rejectUrl,
      expiresInHours,
    }),
  });
}

/**
 * Builds a standalone, professionally styled HTML page (not an email) shown
 * in the admin's browser after clicking an Approve/Reject/expired link.
 * `variant` controls the accent color: 'success' | 'error' | 'rejected'.
 */
function buildActionResultPage({ heading, message, variant = 'success' }) {
  const accent =
    variant === 'success' ? '#16a34a' : variant === 'rejected' ? '#dc2626' : '#d97706';
  const icon = variant === 'success' ? '✅' : variant === 'rejected' ? '🚫' : '⚠️';

  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${heading}</title>
    </head>
    <body style="margin:0; padding:0; background-color:#f3f4f6; font-family: 'Segoe UI', Helvetica, Arial, sans-serif; min-height:100vh;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6; padding: 64px 16px; min-height:100vh;">
        <tr>
          <td align="center">
            <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius: 12px; overflow:hidden; box-shadow: 0 4px 16px rgba(15,23,42,0.1); max-width:440px; width:100%;">
              <tr>
                <td style="background-color:${BRAND_NAVY}; padding: 24px 32px;">
                  <span style="font-size:18px; font-weight:700; color:#ffffff;">💧 ${BRAND_NAME}</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 40px 32px; text-align:center;">
                  <div style="font-size:48px; line-height:1; margin-bottom:16px;">${icon}</div>
                  <h1 style="margin:0 0 12px; font-size:20px; color:${accent};">${heading}</h1>
                  <p style="margin:0; font-size:14px; line-height:1.6; color:#374151;">${message}</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 18px 32px; background-color:#f9fafb; border-top:1px solid #eef0f4; text-align:center;">
                  <p style="margin:0; font-size:12px; color:#9ca3af;">${BRAND_NAME} — Admin Approval</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
  `;
}

/**
 * Tells the requesting user their admin account was approved.
 */
async function sendAdminApprovedEmail({ to, fullName }) {
  const mailer = getTransporter();

  const paragraphs = [
    `Hello ${fullName},`,
    'Your request for an Admin account has been approved. You can now log in to the application.',
    'Thank you.',
  ];

  const text = [
    `Hello ${fullName},`,
    '',
    'Your request for an Admin account has been approved.',
    'You can now log in to the application.',
    '',
    'Thank you.',
  ].join('\n');

  await mailer.sendMail({
    from: process.env.SMTP_FROM || `"${BRAND_NAME}" <no-reply@smartwaterquality.local>`,
    to,
    subject: 'Your Admin Request Has Been Approved',
    text,
    html: buildSimpleHtml({ heading: 'Admin Request Approved', paragraphs }),
  });
}

/**
 * Tells the requesting user their admin account was rejected.
 */
async function sendAdminRejectedEmail({ to, fullName, reason }) {
  const mailer = getTransporter();

  const paragraphs = [
    `Hello ${fullName || ''},`.trim(),
    'Unfortunately your request for an Admin account has not been approved.' +
      (reason ? ` Reason: ${reason}` : ''),
    'If you believe this is an error, please contact support.',
  ];

  const text = [
    `Hello ${fullName || ''},`.trim(),
    '',
    'Unfortunately your request for an Admin account has not been approved.',
    reason ? `Reason: ${reason}` : '',
    '',
    'If you believe this is an error, please contact support.',
  ]
    .filter(Boolean)
    .join('\n');

  await mailer.sendMail({
    from: process.env.SMTP_FROM || `"${BRAND_NAME}" <no-reply@smartwaterquality.local>`,
    to,
    subject: 'Admin Request Rejected',
    text,
    html: buildSimpleHtml({ heading: 'Admin Request Rejected', paragraphs }),
  });
}

module.exports = {
  sendPasswordResetEmail,
  sendAdminApprovalRequestEmail,
  sendAdminApprovedEmail,
  sendAdminRejectedEmail,
  buildActionResultPage,
};
