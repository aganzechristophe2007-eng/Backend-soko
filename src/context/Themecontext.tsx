import React, { createContext, useContext, useState, useEffect } from 'react';

interface ThemeContextType {
  customBg: string;
  setCustomBg: (bg: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [customBg, setCustomBgState] = useState<string>(() => {
    const saved = localStorage.getItem('cbfsoko-custom-bg');
    // Migre l’ancien fond sombre par défaut vers le fond blanc, sans écraser les choix personnalisés.
    if (!saved || saved.toLowerCase() === '#080808' || saved.toLowerCase() === '#000000') return '#FFFFFF';
    return saved;
  });

  const setCustomBg = (bg: string) => {
    setCustomBgState(bg);
    localStorage.setItem('cbfsoko-custom-bg', bg);
  };

  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem('cbfsoko-custom-bg');
      if (saved) setCustomBgState(saved);
    };

    window.addEventListener('storage-bg-change', handleStorageChange);
    return () => {
      window.removeEventListener('storage-bg-change', handleStorageChange);
    };
  }, []);

  return (
    <ThemeContext.Provider value={{ customBg, setCustomBg }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme doit être utilisé à l'intérieur d'un ThemeProvider");
  }
  return context;
}

export default useTheme;