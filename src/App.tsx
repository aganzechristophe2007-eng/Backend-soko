import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/Authcontext';
import { ThemeProvider } from './context/Themecontext';

import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import CreateProduct from './pages/CreateProduct';
import Orders from './pages/Orders';
import MessagingPage from "./pages/Messages";
import Wallet from './pages/UseWallet';
import Boutique from './pages/Boutique';
import Productdetails from './pages/Productdetails';
import ProductRenseignement from './pages/Productrenseignement';
import Settings from './pages/Settings';
import UserPage from './pages/userpage';
import About from './pages/About';
import PayPage from './pages/Paypage';
import AdminSeller from './pages/admin-seller';
import Walletpage from './pages/wallet';
import A30IA from './pages/A30IA';
import Notifications from './pages/Notifications';
import NotFound from './pages/NotFound';
import A30Fab from './components/A30Fab';
import AppShell from './components/AppShell';
import { useNotificationSound } from './lib/Son';
import { io, Socket } from 'socket.io-client';
import { BASE_URL } from './api/client';
import { getSocket } from './lib/socket';
import { CallProvider } from './context/CallContext';
import CallModal from './components/CallModal';
import { applyTextPrefs, readSavedTextSize, readSavedTextFamily, TEXT_PREF_EVENT } from './lib/textPrefs';

export default function App() {
  useNotificationSound();
  useEffect(() => {
    applyTextPrefs(readSavedTextSize(), readSavedTextFamily());
    const syncTextPrefs = () => applyTextPrefs(readSavedTextSize(), readSavedTextFamily());
    window.addEventListener(TEXT_PREF_EVENT, syncTextPrefs);
    window.addEventListener('storage', syncTextPrefs);
    return () => {
      window.removeEventListener(TEXT_PREF_EVENT, syncTextPrefs);
      window.removeEventListener('storage', syncTextPrefs);
    };
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <CallProvider>
          <Router>
            <AppShell>
            <Routes>
              {/* Authentification */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              
              {/* Pages principales */}
              <Route path="/" element={<Home />} />
              <Route path="/accueil" element={<Home />} />
              <Route path="/create-product" element={<CreateProduct />} />
              <Route path="/orders" element={<Orders />} />

              {/* Notifications (cette route manquait : /notifications retombait sur Home via path="*") */}
              <Route path="/notifications" element={<Notifications />} />
              
              {/* === ROUTE AJOUTÉE POUR LE PAIEMENT === */}
              <Route path="/pay/:id" element={<PayPage />} />

              <Route path="/messages" element={<MessagingPage />} />
              <Route path="/wallet" element={<Walletpage />} />
              <Route path="/products/:id" element={<Productdetails />} />
              <Route path="/products/:id/renseignement" element={<ProductRenseignement />} />
              
              {/* Boutiques */}
              <Route path="/boutique" element={<Boutique />} />
              <Route path="/shops/:slug" element={<Boutique />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/settings/:section" element={<Settings />} />
              <Route path="/users/:id" element={<UserPage />} />
              <Route path="/a-propos" element={<About />} />

              {/* Tableau de bord admin (accès contrôlé côté serveur par requireRole) */}
              <Route path="/admin-seller" element={<AdminSeller />} />

              {/* A30 IA : l'accès est contrôlé côté serveur (cookie de session) */}
              <Route path="/a30-ia" element={<A30IA />} />

              {/* Redirection globale par défaut */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            </AppShell>
            <A30Fab />
          </Router>
          <CallModal />
        </CallProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}