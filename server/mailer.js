import nodemailer from 'nodemailer';

// SMTP transport is only created when SMTP_HOST is set. In dev / tests the
// mailer becomes a no-op that resolves with `{ skipped: true }`. This means
// the digest scheduler can still tick and surface logs without breaking when
// no SMTP server is available.

let transporter = null;
let initialized = false;
let configured = false;

/**
 * Builds the nodemailer transport options from the environment.
 * Exported so the TLS posture can be asserted in tests without opening a
 * socket. Returns `null` when SMTP is not configured.
 */
export function buildTransportOptions(env = process.env) {
  const host = env.SMTP_HOST;
  if (!host) return null;

  const port = Number(env.SMTP_PORT || 587);
  // 465 implies TLS-on-connect; otherwise STARTTLS is negotiated by nodemailer.
  const secure = env.SMTP_SECURE != null
    ? env.SMTP_SECURE === 'true'
    : port === 465;

  const auth = env.SMTP_USER
    ? { user: env.SMTP_USER, pass: env.SMTP_PASS || '' }
    : undefined;

  return {
    host, port, secure, auth,
    // Sans `requireTLS`, nodemailer tente STARTTLS mais CONTINUE EN CLAIR si le
    // serveur ne l'annonce pas (ou si un actif réseau retire la capacité de la
    // bannière EHLO — « STARTTLS stripping »). Les identifiants SMTP et le
    // contenu des mails partiraient alors en clair (CWE-319). On l'exige donc
    // dès que la connexion n'est pas déjà chiffrée de bout en bout (port 465) :
    // mieux vaut un envoi qui échoue bruyamment qu'un mot de passe sur le fil.
    requireTLS: !secure,
    tls: { minVersion: 'TLSv1.2' },
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
  };
}

function init() {
  if (initialized) return transporter;
  initialized = true;

  const opts = buildTransportOptions();
  if (!opts) {
    console.warn('[mailer] SMTP_HOST not set — emails will be skipped (no-op mailer).');
    return null;
  }

  transporter = nodemailer.createTransport(opts);
  configured = true;
  console.log(
    `[mailer] SMTP transport ready (host=${opts.host}, port=${opts.port}, `
    + `secure=${opts.secure}, requireTLS=${opts.requireTLS}).`,
  );
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
