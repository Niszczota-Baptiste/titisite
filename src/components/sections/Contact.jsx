import { useState } from 'react';
import { ACCENTS } from '../../data/constants';
import { useMagnetic } from '../../hooks/useMagnetic';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Section } from '../layout/Section';
import { SectionHeader } from '../layout/SectionHeader';

const CONTACT_EMAIL = 'contact@baptiste-niszczota.com';
const LINKEDIN_URL = 'https://www.linkedin.com/in/baptiste-niszczota-01090820a/';
const GITHUB_URL = 'https://github.com/Niszczota-Baptiste';

export function Contact({ t, accent }) {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [sent, setSent] = useState(false);
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

  const handleSubmit = (e) => {
    e.preventDefault();
    const subject = `[Portfolio] Message de ${form.name || 'visiteur'}`;
    const body = `${form.message}\n\n— ${form.name}${form.email ? ` <${form.email}>` : ''}`;
    const url = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
    setSent(true);
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
          {sent ? (
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
                Votre client mail s'est ouvert
              </p>
              <p style={{ fontFamily: "'Inter',sans-serif", fontSize: 13, color: 'var(--text-muted)', marginBottom: 18 }}>
                Si rien ne s'est passé, écrivez-moi directement à{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: acc.hex, textDecoration: 'none' }}>
                  {CONTACT_EMAIL}
                </a>
              </p>
              <button
                type="button"
                onClick={() => setSent(false)}
                style={{
                  background: 'none', border: '1px solid var(--border)',
                  color: 'var(--text-muted)', borderRadius: 10, padding: '10px 22px',
                  fontFamily: "'Inter',sans-serif", fontSize: 13, cursor: 'pointer',
                }}
              >
                Réécrire
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
              <button
                ref={submitBtn}
                type="submit"
                style={{
                  background: acc.hex, color: '#08051a', border: 'none',
                  borderRadius: 10, padding: '13px',
                  fontFamily: "'Space Grotesk',sans-serif",
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  transition: 'box-shadow 0.2s,transform 0.18s',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.boxShadow = `0 8px 28px rgba(${acc.rgb},0.4)`)
                }
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
              >
                {t.contact.send}
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
