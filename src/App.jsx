import { useEffect, useRef, useState } from 'react';
import { TWEAK_DEFAULTS } from './data/constants';
import { i18n } from './data/i18n';

import { AmbientCanvas } from './components/ambient/AmbientCanvas';
import { CursorEffect } from './components/ambient/CursorEffect';
import { FloatingPauseButton } from './components/ambient/FloatingPauseButton';
import { ScrollProgress } from './components/ambient/ScrollProgress';

import { Footer } from './components/layout/Footer';
import { Nav } from './components/layout/Nav';

import { About } from './components/sections/About';
import { Contact } from './components/sections/Contact';
import { CurrentlyBuilding } from './components/sections/CurrentlyBuilding';
import { Education } from './components/sections/Education';
import { Experience } from './components/sections/Experience';
import { Hero } from './components/sections/Hero';
import { Music } from './components/sections/Music';
import { Projects } from './components/sections/Projects';

import { EasterEgg } from './components/overlays/EasterEgg';
import { TweaksPanel } from './components/overlays/TweaksPanel';

export default function App() {
  const [lang, setLang] = useState(() => localStorage.getItem('portfolio_lang') || 'fr');
  const [mode, setMode] = useState(() => localStorage.getItem('portfolio_mode') || 'dark');
  const [tweaksVisible, setTweaksVisible] = useState(false);
  const [easter, setEaster] = useState(false);
  const [tweaks, setTweaksState] = useState(() => {
    try {
      return {
        ...TWEAK_DEFAULTS,
        ...JSON.parse(localStorage.getItem('portfolio_tweaks') || '{}'),
      };
    } catch {
      return { ...TWEAK_DEFAULTS };
    }
  });

  const scrollRef = useRef(0);
  const activeSectionRef = useRef('hero');
  const { accent } = tweaks;
  const t = i18n[lang] || i18n.fr;

  useEffect(() => {
    localStorage.setItem('portfolio_lang', lang);
  }, [lang]);

  useEffect(() => {
    localStorage.setItem('portfolio_mode', mode);
    document.body.classList.add('mode-transitioning');
    document.body.classList.toggle('mode-light', mode === 'light');
    const tid = setTimeout(() => document.body.classList.remove('mode-transitioning'), 520);
    return () => clearTimeout(tid);
  }, [mode]);

  useEffect(() => {
    const ff =
      tweaks.fontStyle === 'humanist'
        ? "'Georgia','Times New Roman',serif"
        : "'Space Grotesk',sans-serif";
    document.querySelectorAll('h1,h2,h3').forEach((el) => (el.style.fontFamily = ff));
  }, [tweaks.fontStyle]);

  useEffect(() => {
    const fn = () => {
      scrollRef.current = window.scrollY;
    };
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => {
    const ids = ['hero', 'projects', 'music', 'about', 'education', 'experience', 'contact', 'current'];
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) activeSectionRef.current = e.target.id;
        });
      },
      { threshold: 0.45 }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
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
    try {
      localStorage.setItem('portfolio_tweaks', JSON.stringify(next));
    } catch {
      /* ignore quota */
    }
  };

  const bodyFont = lang === 'ko' ? "'Noto Sans KR','Inter',sans-serif" : "'Inter',sans-serif";

  return (
    <div style={{ fontFamily: bodyFont, minHeight: '100vh', position: 'relative' }}>
      <ScrollProgress accent={accent} />
      <AmbientCanvas
        scrollRef={scrollRef}
        activeSectionRef={activeSectionRef}
        accent={accent}
        mode={mode}
      />
      <CursorEffect accent={accent} activeSectionRef={activeSectionRef} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <Nav
          lang={lang}
          setLang={setLang}
          t={t}
          accent={accent}
          mode={mode}
          toggleMode={() => setMode((m) => (m === 'dark' ? 'light' : 'dark'))}
        />
        <Hero t={t} lang={lang} accent={accent} mode={mode} />
        <Projects t={t} lang={lang} accent={accent} />
        <Music t={t} accent={accent} />
        <About t={t} accent={accent} />
        <Education t={t} lang={lang} accent={accent} />
        <Experience t={t} lang={lang} accent={accent} />
        <CurrentlyBuilding lang={lang} accent={accent} />
        <Contact t={t} accent={accent} />
        <Footer t={t} accent={accent} onEaster={() => setEaster(true)} />
      </div>

      <EasterEgg visible={easter} onClose={() => setEaster(false)} accent={accent} />
      <TweaksPanel tweaks={tweaks} setTweaks={setTweaksValue} visible={tweaksVisible} />
      <FloatingPauseButton accent={accent} />
    </div>
  );
}
