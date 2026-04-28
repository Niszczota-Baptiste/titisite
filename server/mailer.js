import nodemailer from 'nodemailer';

// SMTP transport is only created when SMTP_HOST is set. In dev / tests the
// mailer becomes a no-op that resolves with `{ skipped: true }`. This means
// the digest scheduler can still tick and surface logs without breaking when
// no SMTP server is available.

let transporter = null;
let initialized = false;
let configured = false;

function init() {
  if (initialized) return transporter;
  initialized = true;

  const host = process.env.SMTP_HOST;
  if (!host) {
    console.warn('[mailer] SMTP_HOST not set — emails will be skipped (no-op mailer).');
    return null;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  // 465 implies TLS-on-connect; otherwise STARTTLS is negotiated by nodemailer.
  const secure = process.env.SMTP_SECURE != null
    ? process.env.SMTP_SECURE === 'true'
    : port === 465;

  const auth = process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
    : undefined;

  transporter = nodemailer.createTransport({
    host, port, secure, auth,
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
  });
  configured = true;
  console.log(`[mailer] SMTP transport ready (host=${host}, port=${port}, secure=${secure}).`);
  return transporter;
}

export function isMailerConfigured() {
  init();
  return configured;
}

export async function sendMail({ to, subject, text, html }) {
  const tx = init();
  if (!tx) return { skipped: true };

  const from = process.env.SMTP_FROM
    || (process.env.SMTP_USER ? process.env.SMTP_USER : 'no-reply@titisite.local');

  return tx.sendMail({ from, to, subject, text, html });
}
