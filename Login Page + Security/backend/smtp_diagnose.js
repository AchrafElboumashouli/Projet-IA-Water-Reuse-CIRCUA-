/**
 * Standalone SMTP diagnostic — run this directly on your machine with:
 *   node smtp_diagnose.js
 *
 * It loads the same backend/.env your app uses and tries, in order:
 *   1. Raw TCP connect to the SMTP host/port (rules out firewall/network blocking)
 *   2. Nodemailer verify() with your real credentials (rules out auth issues)
 *   3. Sending an actual test email to ADMIN_APPROVAL_EMAIL
 *
 * Run it from inside backend/ so dotenv finds your .env file.
 */
require('dotenv').config();
const net = require('net');
const nodemailer = require('nodemailer');

const HOST = process.env.SMTP_HOST;
const PORT = Number(process.env.SMTP_PORT) || 587;

function testRawTcp() {
  return new Promise((resolve) => {
    console.log(`\n[1/3] Testing raw TCP connection to ${HOST}:${PORT} ...`);
    const socket = net.createConnection({ host: HOST, port: PORT, timeout: 10000 });

    socket.on('connect', () => {
      console.log('  ✅ TCP connection succeeded.');
      socket.end();
      resolve(true);
    });

    socket.on('timeout', () => {
      console.log('  ❌ TCP connection TIMED OUT — your network is likely blocking outbound SMTP.');
      socket.destroy();
      resolve(false);
    });

    socket.on('error', (err) => {
      console.log(`  ❌ TCP connection FAILED: ${err.code || err.message}`);
      resolve(false);
    });
  });
}

async function testAuth(port, secure) {
  console.log(`\n[2/3] Testing SMTP auth as ${process.env.SMTP_USER} on port ${port} (secure=${secure}) ...`);
  const config = {
    host: HOST,
    port,
    secure,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    tls: {
      minVersion: 'TLSv1.2',
    },
    logger: true,
    debug: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  };

  if (process.env.SMTP_PROXY) {
    console.log(`  (routing through proxy: ${process.env.SMTP_PROXY})`);
    config.proxy = process.env.SMTP_PROXY;
  }

  const transporter = nodemailer.createTransport(config);

  if (process.env.SMTP_PROXY && process.env.SMTP_PROXY.startsWith('socks')) {
    try {
      transporter.set('proxy_socks_module', require('socks'));
    } catch (e) {
      console.log('  ⚠️  SMTP_PROXY is socks:// but the "socks" package is not installed.');
      console.log('     Run: npm install socks');
      return null;
    }
  }

  try {
    await transporter.verify();
    console.log(`  ✅ SMTP auth succeeded on port ${port}.`);
    return transporter;
  } catch (err) {
    console.log(`  ❌ SMTP auth FAILED on port ${port}: ${err.code || ''} ${err.message}`);
    return null;
  }
}

async function testSend(transporter) {
  const to = process.env.ADMIN_APPROVAL_EMAIL;
  console.log(`\n[3/3] Sending a real test email to ${to} ...`);
  if (!to) {
    console.log('  ⚠️  ADMIN_APPROVAL_EMAIL is not set — skipping send test.');
    return;
  }
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject: 'SMTP diagnostic test',
      text: 'If you got this, your SMTP config works end-to-end.',
    });
    console.log('  ✅ Email sent. Message ID:', info.messageId);
  } catch (err) {
    console.log(`  ❌ Send FAILED: ${err.code || ''} ${err.message}`);
  }
}

(async () => {
  console.log('=== SMTP Diagnostic ===');
  console.log('Host:', HOST, '| Port:', PORT);
  console.log('Proxy:', process.env.SMTP_PROXY || '(none — direct connection)');

  const tcpOk = await testRawTcp();
  if (!tcpOk) {
    console.log(
      '\n👉 The raw connection already fails, so this is a network/firewall issue,\n' +
        '   not a code or credentials issue. Common causes:\n' +
        '   - Your ISP, university network, or hosting provider blocks outbound port 587/465\n' +
        '   - A local firewall or antivirus is blocking Node\'s network access\n' +
        '   - You are behind a VPN/proxy that intercepts SMTP\n' +
        '   Try switching networks (e.g. mobile hotspot) and re-running this script,\n' +
        '   or ask your network admin whether outbound SMTP is blocked.'
    );
    return;
  }

  const transporter587 = await testAuth(587, false);
  const transporter465 = transporter587 ? null : await testAuth(465, true);
  const transporter = transporter587 || transporter465;

  if (!transporter) {
    console.log(
      '\n👉 TCP connects fine but auth fails on BOTH ports with ECONNRESET during the\n' +
        '   TLS/auth handshake (not immediately on connect). This pattern usually means\n' +
        '   something is intercepting or breaking encrypted traffic mid-handshake:\n' +
        '   - Antivirus "email scanning" / "web shield" (Kaspersky, Avast, ESET, etc.)\n' +
        '     that MITM-inspects SMTP/TLS traffic — try disabling it temporarily\n' +
        '   - Corporate/school proxy or firewall doing deep packet inspection\n' +
        '   - Windows Defender Firewall blocking Node.js specifically — check\n' +
        '     Windows Security > Firewall > Allow an app, and make sure node.exe is allowed\n' +
        '   - A VPN client interfering with the connection\n' +
        '   Try: temporarily disable antivirus/VPN, retry on a mobile hotspot, and if it\n' +
        '   works there, the problem is local network/software, not your code or Gmail.'
    );
    return;
  }

  await testSend(transporter);
})();
