import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../api/client';

interface AuthContextType {
  user: any;
  login: (userData: any) => void;
  logout: () => void;
  // Ajouté : relit /auth/me (nouveau rôle, nouvelle photo...) sans recharger la page.
  refreshUser: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    apiFetch('/auth/me')
      .then((res: any) => {
        if (!isMounted) return;
        const userData = res?.data || res?.user || res;
        setUser(userData);
      })
      .catch(() => {
        if (isMounted) setUser(null);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const login = (userData: any) => {
    setUser(userData);
  };

  const logout = async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (e) {
      // Ignorer l'erreur réseau lors de la déconnexion
    } finally {
      setUser(null);
    }
  };

  const refreshUser = async () => {
    try {
      const res: any = await apiFetch('/auth/me');
      setUser(res?.data || res?.user || res);
    } catch (e) {
      // Session expirée : on ne touche pas à l'état, la prochaine requête protégée redirigera.
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth doit être utilisé à l'intérieur d'un AuthProvider");
  }
  return context;
}