import React, { createContext, useContext, useState, useCallback } from 'react';
import it from './locales/it';
import en from './locales/en';

const I18N_DATA: Record<string, any> = {
  it,
  en
};

type Language = 'it' | 'en';

interface I18nContextType {
  lang: Language;
  t: (key: string, replacements?: Record<string, string | number>) => string;
  setLang: (lang: Language) => void;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    const saved = localStorage.getItem('ui_lang');
    if (saved === 'it' || saved === 'en') return saved;
    const browserLang = navigator.language.toLowerCase();
    return browserLang.startsWith('en') ? 'en' : 'it';
  });

  const t = useCallback(
    (key: string, replacements: Record<string, string | number> = {}): string => {
      const parts = key.split('.');
      let val = I18N_DATA[lang];
      for (const part of parts) {
        if (val && val[part] !== undefined) {
          val = val[part];
        } else {
          return key;
        }
      }
      if (typeof val === 'string') {
        let res = val;
        for (const k in replacements) {
          res = res.replace(`{${k}}`, String(replacements[k]));
        }
        return res;
      }
      return key;
    },
    [lang]
  );

  const setLang = (l: Language) => {
    setLangState(l);
    localStorage.setItem('ui_lang', l);
    window.dispatchEvent(new CustomEvent('languagechanged', { detail: l }));
  };

  return (
    <I18nContext.Provider value={{ lang, t, setLang }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
};
