import { useEffect, useState } from 'react';

/** Tracks a CSS media query; false where `matchMedia` is unavailable. */
export function useMediaQuery(query: string): boolean {
  const read = () => (typeof matchMedia === 'function' ? matchMedia(query).matches : false);
  const [matches, setMatches] = useState(read);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const list = matchMedia(query);
    const update = () => setMatches(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);

  return matches;
}

/** Spec §6.15: the sidebar becomes a tab bar below 768px. */
export const PHONE_QUERY = '(max-width: 767px)';
