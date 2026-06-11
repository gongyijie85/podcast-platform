import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './zh-CN.json';
import enUS from './en-US.json';

const readStored = (): string => {
  try {
    return localStorage.getItem('i18n.lang') || localStorage.getItem('podcast-platform:ui.language') || 'zh-CN';
  } catch {
    return 'zh-CN';
  }
};

const stored = readStored();

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: stored,
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem('i18n.lang', lng);
  } catch {
    /* ignore */
  }
});

export default i18n;
