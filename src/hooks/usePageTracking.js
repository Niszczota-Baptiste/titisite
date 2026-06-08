import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api, sendBeaconJSON } from '../api/client';

// Measures *active* dwell time (paused while the tab is hidden) and the
// furthest scroll depth reached on the current route, then sends one
// fire-and-forget beacon when the route unmounts or the page is hidden /
// closed. Skips back-office routes (mirrored by the server-side guard).
//
// Also records a pageview hit on each route change (replacing the previous
// inline tracker in App.jsx so all timing logic lives in one place).
export function usePageTracking() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname.startsWith('/admin') || pathname.startsWith('/project')) {
      return undefined;
    }

    api.analytics.hit(pathname, document.referrer).catch(() => {});

    let activeMs = 0;
    let lastResume = document.visibilityState === 'visible' ? Date.now() : null;
    let maxScroll = computeScrollPct();
    let scrollRaf = 0;
    let sent = false;

    const onScroll = () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        const pct = computeScrollPct();
        if (pct > maxScroll) maxScroll = pct;
      });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (lastResume !== null) {
          activeMs += Date.now() - lastResume;
          lastResume = null;
        }
      } else if (lastResume === null) {
        lastResume = Date.now();
      }
    };
    const send = () => {
      if (sent) return;
      sent = true;
      if (lastResume !== null) {
        activeMs += Date.now() - lastResume;
        lastResume = null;
      }
      if (activeMs < 250) return;
      sendBeaconJSON('/api/analytics/track', {
        path: pathname,
        durationMs: activeMs,
        scrollPct: maxScroll,
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', send);

    return () => {
      send();
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', send);
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
    };
  }, [pathname]);
}

// Furthest scroll reached, as 0..100 percent of the reachable scroll height.
// Returns 100 if the page fits in the viewport (nothing to scroll).
function computeScrollPct() {
  const doc = document.documentElement;
  const scrollable = doc.scrollHeight - doc.clientHeight;
  if (scrollable <= 0) return 100;
  const scrolled = window.scrollY || doc.scrollTop || 0;
  return Math.max(0, Math.min(100, Math.round((scrolled / scrollable) * 100)));
}
