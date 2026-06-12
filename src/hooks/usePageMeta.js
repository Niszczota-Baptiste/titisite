import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_NAME = 'Baptiste Niszczota';
const DEFAULT_TITLE = 'Baptiste Niszczota — Développeur créatif & compositeur';
const DEFAULT_DESCRIPTION = 'Portfolio de Baptiste Niszczota — développeur créatif, compositeur et chef de projet. Projets web, musique, expériences interactives.';

function setMeta(selector, attr, value) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

// Per-route SEO meta: document.title, meta description and the canonical URL.
// Call with no args to restore the site defaults (home page). Pass `null`
// while data is loading — the meta only updates once a real value arrives.
export function usePageMeta(title, description) {
  const { pathname } = useLocation();

  useEffect(() => {
    if (title === null) return; // data not loaded yet — keep previous meta
    const fullTitle = title ? `${title} — ${SITE_NAME}` : DEFAULT_TITLE;
    const desc = description || DEFAULT_DESCRIPTION;
    document.title = fullTitle;
    setMeta('meta[name="description"]', 'content', desc);
    setMeta('meta[property="og:title"]', 'content', fullTitle);
    setMeta('meta[property="og:description"]', 'content', desc);
    setMeta('meta[name="twitter:title"]', 'content', fullTitle);
    setMeta('meta[name="twitter:description"]', 'content', desc);
    // Canonical: origin + clean pathname (no query/hash).
    const href = window.location.origin + pathname;
    setMeta('link[rel="canonical"]', 'href', href);
    setMeta('meta[property="og:url"]', 'content', href);
  }, [title, description, pathname]);
}
