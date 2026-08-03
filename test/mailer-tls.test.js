import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTransportOptions } from '../server/mailer.js';

// Le transport SMTP ne doit jamais pouvoir retomber en clair. nodemailer tente
// STARTTLS par défaut mais poursuit en clair si le serveur ne l'annonce pas —
// y compris quand un actif réseau a retiré la capacité de la bannière EHLO
// (« STARTTLS stripping »). Les identifiants SMTP et le corps des messages
// (contenu du formulaire de contact, digests) partiraient alors en clair.

test('SMTP non configuré → pas de transport (mailer no-op)', () => {
  assert.equal(buildTransportOptions({}), null);
});

test('port 587 (STARTTLS) : requireTLS exigé + TLS 1.2 minimum', () => {
  const o = buildTransportOptions({ SMTP_HOST: 'smtp.example.net' });
  assert.equal(o.port, 587);
  assert.equal(o.secure, false);
  assert.equal(o.requireTLS, true, 'sans requireTLS, un serveur sans STARTTLS ferait passer le mot de passe en clair');
  assert.equal(o.tls.minVersion, 'TLSv1.2');
});

test('port 465 : TLS dès la connexion, requireTLS sans objet', () => {
  const o = buildTransportOptions({ SMTP_HOST: 'smtp.example.net', SMTP_PORT: '465' });
  assert.equal(o.secure, true);
  assert.equal(o.requireTLS, false);
  assert.equal(o.tls.minVersion, 'TLSv1.2');
});

test('SMTP_SECURE=false sur un port non standard reste protégé par requireTLS', () => {
  const o = buildTransportOptions({
    SMTP_HOST: 'smtp.example.net', SMTP_PORT: '2525', SMTP_SECURE: 'false',
  });
  assert.equal(o.secure, false);
  assert.equal(o.requireTLS, true);
});

test('les identifiants ne sont posés que si SMTP_USER est défini', () => {
  const anon = buildTransportOptions({ SMTP_HOST: 'smtp.example.net' });
  assert.equal(anon.auth, undefined);
  const withAuth = buildTransportOptions({
    SMTP_HOST: 'smtp.example.net', SMTP_USER: 'bot@example.net', SMTP_PASS: 'x',
  });
  assert.deepEqual(withAuth.auth, { user: 'bot@example.net', pass: 'x' });
});
