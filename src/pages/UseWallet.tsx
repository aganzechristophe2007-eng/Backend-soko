import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wallet, ArrowUpRight, ArrowDownLeft, LogOut } from 'lucide-react';

export default function FullUserWallet() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white pb-10 text-[#111111] antialiased selection:bg-[#FF6B00] selection:text-white">
      <header className="sticky top-0 z-40 border-b border-[#EAECF0] bg-white">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            onClick={() => navigate('/')}
            aria-label="Retour à l'accueil"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[#EAECF0] bg-white text-[#111111] transition-colors hover:border-[#FF6B00] hover:text-[#FF6B00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-bold tracking-tight sm:text-lg">Portefeuille & Profil</h1>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-5 px-4 py-6 sm:px-6">
        {/* Solde Carte */}
        <div className="rounded-2xl border border-[#EAECF0] bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#667085]">Solde Total</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FFF1E7] text-[#FF6B00]">
              <Wallet className="h-5 w-5" />
            </span>
          </div>
          <div className="mb-5 text-3xl font-bold tracking-tight text-[#111111]">
            150.00 $
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button className="flex cursor-pointer items-center justify-center space-x-1 rounded-full bg-[#FF6B00] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2">
              <ArrowDownLeft className="h-4 w-4" />
              <span>Déposer</span>
            </button>
            <button className="flex cursor-pointer items-center justify-center space-x-1 rounded-full border border-[#D0D5DD] bg-white py-2.5 text-sm font-semibold text-[#344054] transition-colors hover:bg-[#F9FAFB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]">
              <ArrowUpRight className="h-4 w-4" />
              <span>Retirer</span>
            </button>
          </div>
        </div>

        {/* Paramètres et Déconnexion */}
        <div className="divide-y divide-[#EAECF0] overflow-hidden rounded-2xl border border-[#EAECF0] bg-white">
          <button
            onClick={() => { localStorage.removeItem('token'); navigate('/login'); }}
            className="flex w-full items-center gap-2 px-4 py-3.5 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Se déconnecter
          </button>
        </div>
      </main>
    </div>
  );
}
