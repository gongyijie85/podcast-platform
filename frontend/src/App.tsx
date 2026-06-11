import { useEffect } from 'react';
import { useAuthStore } from './store/auth.store';
import { useUiStore } from './store/ui.store';
import i18n from './i18n';
import AppRoutes from './router';

/**
 * Top-level app. Owns initialization (auth, theme/lang sync) and delegates
 * the actual route table to ./router which lazy-loads each page.
 */
function App(): JSX.Element {
  const initAuth = useAuthStore((s) => s.init);
  const language = useUiStore((s) => s.language);
  const theme = useUiStore((s) => s.theme);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // sync i18next language to ui store
  useEffect(() => {
    if (i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language]);

  // data-theme attribute is managed inside ui.store; we apply here for clarity
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return <AppRoutes />;
}

export default App;
