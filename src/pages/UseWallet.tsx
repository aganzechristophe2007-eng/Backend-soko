import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wallet, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

export default function FullUserWallet() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 pb-20">
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-900/90 px-4 py-3 flex items-center space-x-3">
        <button onClick={() => navigate('/')} className="p-1.5 rounded-lg hover:bg-neutral-800 transition text-neutral-400 hover:text-neutral-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-base">Portefeuille & Profil</h1>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 space-y-6">
        {/* Solde Carte */}
        <div className="p-6 rounded-xl border border-neutral-800 bg-neutral-900">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Solde Total</span>
            <Wallet className="w-5 h-5 text-orange-600" />
          </div>
          <div className="text-3xl font-bold tracking-tight text-neutral-100 mb-4">
            150.00 $
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button className="py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition flex items-center justify-center space-x-1 cursor-pointer">
              <ArrowDownLeft className="w-4 h-4" />
              <span>Déposer</span>
            </button>
            <button className="py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-sm font-medium transition flex items-center justify-center space-x-1 cursor-pointer">
              <ArrowUpRight className="w-4 h-4" />
              <span>Retirer</span>
            </button>
          </div>
        </div>

        {/* Paramètres et Déconnexion */}
        <div className="border border-neutral-800 rounded-xl bg-neutral-900 divide-y divide-neutral-800">
          <button 
            onClick={() => { localStorage.removeItem('token'); navigate('/login'); }}
            className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-neutral-800/50 transition first:rounded-t-xl last:rounded-b-xl"
          >
            Se déconnecter
          </button>
        </div>
      </main>
    </div>
  );
}