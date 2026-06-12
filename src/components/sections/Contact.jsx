import { useState } from 'react';
import { api, trackEvent } from '../../api/client';
import { ACCENTS } from '../../data/constants';
import { useMagnetic } from '../../hooks/useMagnetic';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Section } from '../layout/Section';
import { SectionHeader } from '../layout/SectionHeader';

const CONTACT_EMAIL = 'contact@baptiste-niszczota.com';
const LINKEDIN_URL = 'https://www.linkedin.com/in/baptiste-niszczota-01090820a/';
const GITHUB_URL = 'https://github.com/Niszczota-Baptiste';

export function Contact({ t, accent }) {
  // `website` is a honeypot: hidden from humans, filled by naive bots. The
  // server answers 200 without storing anything when it's non-empty.
  const [form, setForm] = useState({ name: '', email: '', message: '', website: '' });
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState('');
  const acc = ACCENTS[accent] || ACCENTS.violet;
  const submitBtn = useMagnetic(0.22);
  const mobile = useIsMobile(720);

  const fs = {
    width: '100%',
    background: 'var(--input-bg)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    padding: '12px 16px',
    color: 'var(--text)',
    fontFamily: "'Inter',sans-serif",
    fontSize: 14,
    outline: 'none',
    resize: 'vertical',
    backdropFilter: 'blur(8px)',
    transition: 'border-color 0.2s',
  };

  const fld = (k) => ({
    value: form[k],
    onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })),
    onFocus: (e) => (e.target.style.borderColor = acc.hex),
    onBlur: (e) => (e.target.style.borderColor = 'var(--border)'),
    style: fs,
  });

  const socials = [
    { label: 'LinkedIn', href: LINKEDIN_URL, icon: 'in' },
    { label: 'GitHub', href: GITHUB_URL, icon: 'gh' },
    { label: 'Email', href: `mailto:${CONTACT_EMAIL}`, icon: '@' },
  ];

  // Pre-filled mailto, kept as fallback when the API is unreachable.
  const mailtoUrl = () => {
    const subject = `[Portfolio] Message de ${form.name || 'visiteur'}`;
    const body = `${form.message}\n\n— ${form.name}${form.email ? ` <${form.email}>` : ''}`;
    return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.message.trim().length < 10) {
      setStatus('error');
      setErrorMsg(t.contact.tooShort);
      return;
    }
    setStatus('sending');
    setErrorMsg('');
    trackEvent('contact_submit', 'form');
    try {
      await api.contact.send({
        name: form.name,
        email: form.email,
        message: form.message,
        website: form.website,
      });
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err?.body?.error === 'invalid_message' ? t.contact.tooShort : t.contact.error);
    }
  };

  return (
    <Section id="contact" bg="var(--section-alt)">
      <SectionHeader title={t.contact.title} subtitle={t.contact.subtitle} accent={accent} />
      <div style={{
        display: 'grid',
        gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
        gap: mobile ? 48 : 80,
      }}>
        <div className="reveal">
          {status === 'sent' ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}>
              <div
                style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: `rgba(${acc.rgb},0.12)`,
                  border: `1px solid ${acc.hex}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 18px', fontSize: 20, color: acc.hex,
                }}
              >
                ✓
              </div>
              <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 20, color: acc.hex, marginBottom: 10 }}>
                {t.contact.sent}
              </p>
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>
                {t.contact.sentDesc}
              </p>
              <button
                type="button"
                onClick={() => { setStatus('idle'); setForm({ name: '', email: '', message: '', website: '' }); }}
                style={{
                  background: 'none', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', borderRadius: 10, padding: '10px 22px',
                  fontFamily: "'Inter',sans-serif", fontSize: 13, cursor: 'pointer',
                }}
              >
                {t.contact.again}
              </button>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <input placeholder={t.contact.name} required {...fld('name')} />
              <input type="email" placeholder={t.contact.email} required {...fld('email')} />
              <textarea rows={5} placeholder={t.contact.message} required {...fld('message')} />
              {/* Honeypot — hidden from humans (and from screen readers). */}
              <input
                type="text"
                name="website"
                value={form.website}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
              />
              {status === 'error' && (
                <div style={{
                  background: 'rgba(255,100,120,0.08)', border: '1px solid rgba(255,100,120,0.3)',
                  borderRadius: 10, padding: '10px 14px',
                  fontFamily: "'Inter',sans-serif", fontSize: 13, color: '#ff8a9b',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  gap: 10, flexWrap: 'wrap',
                }}>
                  <span>{errorMsg || t.contact.error}</span>
                  {errorMsg !== t.contact.tooShort && (
                    <a
                      href={mailtoUrl()}
                      style={{ color: acc.hex, textDecoration: 'none', fontWeight: 600 }}
                    >
                      {t.contact.errorMailto} ↗
                    </a>
                  )}
                </div>
              )}
              <button
                ref={submitBtn}
                type="submit"
                disabled={status === 'sending'}
                style={{
                  background: acc.hex, color: '#08051a', border: 'none',
                  borderRadius: 10, padding: '13px',
                  fontFamily: "'Space Grotesk',sans-serif",
                  fontSize: 14, fontWeight: 700,
                  cursor: status === 'sending' ? 'wait' : 'pointer',
                  opacity: status === 'sending' ? 0.7 : 1,
                  transition: 'box-shadow 0.2s,transform 0.18s',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.boxShadow = `0 8px 28px rgba(${acc.rgb},0.4)`)
                }
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
              >
                {status === 'sending' ? t.contact.sending : t.contact.send}
              </button>
            </form>
          )}
        </div>
        <div className="reveal" style={{ transitionDelay: '0.15s', paddingTop: 8 }}>
          <p
            style={{
              fontFamily: "'Inter',sans-serif", fontSize: 11,
              color: 'var(--text-faint)', letterSpacing: '1.5px',
              textTransform: 'uppercase', marginBottom: 24,
            }}
          >
            {t.contact.social}
          </p>
          {socials.map((s) => (
            <a
              key={s.label}
              href={s.href}
              onClick={() => trackEvent(s.label === 'Email' ? 'contact_submit' : 'link_click', s.label.toLowerCase())}
              data-interactive
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '16px 0', borderBottom: '1px solid var(--border-dim)',
                textDecoration: 'none', color: 'var(--text-muted)',
                transition: 'color 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = acc.hex)}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
            >
              <span
                style={{
                  width: 36, height: 36,
                  background: 'var(--surface-solid)',
                  border: '1px solid var(--border)',
                  borderRadius: 9,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'monospace', fontSize: 12,
                  color: 'var(--text-faint)', flexShrink: 0,
                }}
              >
                {s.icon}
              </span>
              <span
                style={{
                  fontFamily: "'Space Grotesk',sans-serif",
                  fontSize: 15, fontWeight: 500,
                }}
              >
                {s.label}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 14 }}>↗</span>
            </a>
          ))}
        </div>
      </div>
    </Section>
  );
}
