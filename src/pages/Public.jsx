import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { TWEAK_DEFAULTS } from '../data/constants';
import { i18n } from '../data/i18n';
import { useContent } from '../hooks/useContent';

const DEFAULT_SECTIONS = [
  { id: 'projects',   visible: true },
  { id: 'music',      visible: true },
  { id: 'about',      visible: true },
  { id: 'education',  visible: true },
  { id: 'experience', visible: true },
  { id: 'current',    visible: true },
  { id: 'contact',    visible: true },
];

import { AmbientCanvas } from '../components/ambient/AmbientCanvas';
import { CursorEffect } from '../components/ambient/CursorEffect';
import { FloatingPauseButton } from '../components/ambient/FloatingPauseButton';
import { ScrollProgress } from '../components/ambient/ScrollProgress';

import { Footer } from '../components/layout/Footer';
import { Nav } from '../components/layout/Nav';

import { About } from '../components/sections/About';
import { Contact } from '../components/sections/Contact';
import { CurrentlyBuilding } from '../components/sections/CurrentlyBuilding';
import { Education } from '../components/sections/Education';
import { Experience } from '../components/sections/Experience';
import { Hero } from '../components/sections/Hero';
import { Music } from '../components/sections/Music';
import { Projects } from '../components/sections/Projects';

import { EasterEgg } from '../components/overlays/EasterEgg';
import { TweaksPanel } from '../components/overlays/TweaksPanel';

export default function Public() {
  const [lang, setLang] = useState(() => localStorage.getItem('portfolio_lang') || 'fr');
  const [mode, setMode] = useState(() => localStorage.getItem('portfolio_mode') || 'dark');
  const [tweaksVisible, setTweaksVisible] = useState(false);
  const [easter, setEaster] = useState(false);
  const [tweaks, setTweaksState] = useState(() => {
    try {
      return { ...TWEAK_DEFAULTS, ...JSON.parse(localStorage.getItem('portfolio_tweaks') || '{}') };
    } catch {
      return { ...TWEAK_DEFAULTS };
    }
  });

  const scrollRef = useRef(0);
  const activeSectionRef = useRef('hero');
  const { accent } = tweaks;
  const t = i18n[lang] || i18n.fr;
  const { data } = useContent();
  const [sections, setSections] = useState(DEFAULT_SECTIONS);
  useEffect(() => {
    api.publicSections()
      .then((r) => Array.isArray(r?.sections) && r.sections.length && setSections(r.sections))
      .catch(() => {});
  }, []);

  useEffect(() => { localStorage.setItem('portfolio_lang', lang); }, [lang]);

  useEffect(() => {
    localStorage.setItem('portfolio_mode', mode);
    document.body.classList.add('mode-transitioning');
    document.body.classList.toggle('mode-light', mode === 'light');
    const tid = setTimeout(() => document.body.classList.remove('mode-transitioning'), 520);
    return () => clearTimeout(tid);
  }, [mode]);

  useEffect(() => {
    const ff = tweaks.fontStyle === 'humanist'
      ? "'Georgia','Times New Roman',serif"
      : "'Space Grotesk',sans-serif";
    document.querySelectorAll('h1,h2,h3').forEach((el) => (el.style.fontFamily = ff));
  }, [tweaks.fontStyle]);

  useEffect(() => {
    const fn = () => { scrollRef.current = window.scrollY; };
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => {
    const ids = ['hero', 'projects', 'music', 'about', 'education', 'experience', 'contact', 'current'];
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) activeSectionRef.current = e.target.id; });
      },
      { threshold: 0.45 },
    );
    ids.forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const fn = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksVisible(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksVisible(false);
    };
    window.addEventListener('message', fn);
    return () => window.removeEventListener('message', fn);
  }, []);

  const setTweaksValue = (next) => {
    setTweaksState(next);
    try { localStorage.setItem('portfolio_tweaks', JSON.stringify(next)); } catch { /* ignore */ }
  };

  const bodyFont = lang === 'ko' ? "'Noto Sans KR','Inter',sans-serif" : "'Inter',sans-serif";

  return (
    <div style={{ fontFamily: bodyFont, minHeight: '100vh', position: 'relative' }}>
      <ScrollProgress accent={accent} />
      <AmbientCanvas scrollRef={scrollRef} activeSectionRef={activeSectionRef} accent={accent} mode={mode} />
      <CursorEffect accent={accent} activeSectionRef={activeSectionRef} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <Nav lang={lang} setLang={setLang} t={t} accent={accent} mode={mode}
             toggleMode={() => setMode((m) => (m === 'dark' ? 'light' : 'dark'))} />
        <Hero t={t} lang={lang} accent={accent} mode={mode} />
        {sections.map((s) => {
          if (!s.visible) return null;
          switch (s.id) {
            case 'projects':   return <Projects key="projects" t={t} lang={lang} accent={accent} items={data.projects} />;
            case 'music':      return <Music key="music" t={t} accent={accent} tracks={data.tracks} />;
            case 'about':      return <About key="about" t={t} accent={accent} />;
            case 'education':  return <Education key="education" t={t} lang={lang} accent={accent} items={data.education} />;
            case 'experience': return <Experience key="experience" t={t} lang={lang} accent={accent} items={data.experience} />;
            case 'current':    return <CurrentlyBuilding key="current" lang={lang} accent={accent} items={data.currently} />;
            case 'contact':    return <Contact key="contact" t={t} accent={accent} />;
            default: return null;
          }
        })}
        <Footer t={t} accent={accent} onEaster={() => setEaster(true)} />
      </div>

      <EasterEgg visible={easter} onClose={() => setEaster(false)} accent={accent} />
      <TweaksPanel tweaks={tweaks} setTweaks={setTweaksValue} visible={tweaksVisible} />
      <FloatingPauseButton accent={accent} />
    </div>
  );
}
