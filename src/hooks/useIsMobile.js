import { useEffect, useState } from 'react';

/**
 * Reactive mobile breakpoint. Returns true when window width is below `bp`.
 * Defaults to 768px (tablet portrait). Re-evaluates on resize.
 */
export function useIsMobile(bp = 768) {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < bp,
  );
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < bp);
    window.addEventListener('resize', fn, { passive: true });
    return () => window.removeEventListener('resize', fn);
  }, [bp]);
  return mobile;
}
