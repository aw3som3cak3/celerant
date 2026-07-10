'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_LOCALE, LOCALES, translate, type Locale } from '@/lib/i18n';

const LOCALE_KEY = 'celerant.locale';

type Ctx = { locale: Locale; setLocale: (l: Locale) => void; t: (key: string) => string };
const LocaleContext = createContext<Ctx>({ locale: DEFAULT_LOCALE, setLocale: () => {}, t: (k) => k });

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Start at the default on both server and first client render (no hydration
  // mismatch), then adopt the saved choice on mount.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const saved = localStorage.getItem(LOCALE_KEY) as Locale | null;
    if (saved && LOCALES.includes(saved)) setLocaleState(saved);
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(LOCALE_KEY, l);
    } catch {
      /* ignore */
    }
  };

  const t = (key: string) => translate(locale, key);
  return <LocaleContext.Provider value={{ locale, setLocale, t }}>{children}</LocaleContext.Provider>;
}

export function useI18n(): Ctx {
  return useContext(LocaleContext);
}
