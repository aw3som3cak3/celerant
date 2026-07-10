'use client';

import { postJSON } from '@/lib/client';
import { LOCALES, LOCALE_LABEL } from '@/lib/i18n';
import { useI18n } from './LocaleProvider';

// Chrome top bar: wordmark, a language selector, and the session actions
// (login when logged out; parent + logout when logged in). Not shown on the
// child's practice screen, which stays deliberately bare.
export function TopBar({ onLogin, authed }: { onLogin?: () => void; authed?: boolean }) {
  const { locale, setLocale, t } = useI18n();

  async function logout() {
    await postJSON('/api/logout', {});
    location.reload(); // keep the cached-families list for quick re-login
  }

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
        {authed && (
          <>
            <a className="topbar-login" href="/parent">
              {t('players.parent')}
            </a>
            <button className="topbar-login" onClick={logout}>
              {t('nav.logout')}
            </button>
          </>
        )}
        {onLogin && !authed && (
          <button className="topbar-login" onClick={onLogin}>
            {t('nav.login')}
          </button>
        )}
      </div>
    </div>
  );
}
