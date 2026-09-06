import { useEffect, useState } from 'react';

export const EDITOR_THEMES = ['system', 'light', 'dark'];
const STORAGE_KEY = 'kheops.editor.theme';

export default function useEditorTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return EDITOR_THEMES.includes(stored) ? stored : 'system';
    } catch (_) { return 'system'; }
  });
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)')?.matches === true);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return undefined;
    const change = event => setSystemDark(event.matches);
    setSystemDark(media.matches);
    media.addEventListener?.('change', change);
    return () => media.removeEventListener?.('change', change);
  }, []);
  const chooseTheme = value => {
    if (!EDITOR_THEMES.includes(value)) return;
    setTheme(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch (_) { /* préférence facultative */ }
  };
  return { theme, chooseTheme, resolvedTheme: theme === 'system' ? (systemDark ? 'dark' : 'light') : theme };
}
