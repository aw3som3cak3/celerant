'use client';

import { LOCALES, LOCALE_LABEL } from '@/lib/i18n';
import { useI18n } from './LocaleProvider';

// Chrome top bar: wordmark, a language selector, and a login button. Not shown
// on the child's practice screen, which stays deliberately bare.
export function TopBar({ onLogin }: { onLogin?: () => void }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div className="topbar">
      <a className="brand" href="/">
        {t('app.name')}
      </a>
      <div className="topbar-right">
        <div role="group" aria-label="language">
          {LOCALES.map((l) => (
            <button
              key={l}
              className={`lang-btn ${locale === l ? 'on' : ''}`}
              onClick={() => setLocale(l)}
              title={LOCALE_LABEL[l]}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
        {onLogin && (
          <button className="topbar-login" onClick={onLogin}>
            {t('nav.login')}
          </button>
        )}
      </div>
    </div>
  );
}
