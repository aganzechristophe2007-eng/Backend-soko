import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/Authcontext';
import { ThemeProvider } from './context/Themecontext'; // <-- Import ajouté

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
export default function App() {
  return (
    <ThemeProvider> {/* <-- ThemeProvider placé en haut de l'arbre */}
      <AuthProvider>
        <Router>
          <Routes>
            {/* Authentification */}
            
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            {/* Pages principales */}
            <Route path="/" element={<Home />} />
            <Route path="/accueil" element={<Home />} />
            <Route path="/create-product" element={<CreateProduct />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/messages" element={<MessagingPage />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/products/:id" element={<Productdetails />} />
            <Route path="/products/:id/renseignement" element={<ProductRenseignement />} />
            
            {/* Boutiques */}
            <Route path="/boutique" element={<Boutique />} />
            <Route path="/shops/:slug" element={<Boutique />} />
            <Route path="/settings" element={<Settings />} />

            {/* Redirection globale par défaut */}
            <Route path="*" element={<Home />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}