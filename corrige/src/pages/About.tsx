import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Info } from 'lucide-react';

// Page volontairement minimale : à compléter plus tard (contenu à définir).
export default function About() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white pb-20 text-[#111111] antialiased selection:bg-[#FF6B00] selection:text-white">
      <header className="sticky top-0 z-40 border-b border-[#EAECF0] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Retour"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[#EAECF0] bg-white text-[#111111] transition-colors hover:border-[#FF6B00] hover:text-[#FF6B00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-bold tracking-tight sm:text-lg">À propos</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-[#EAECF0] bg-white px-6 py-14 text-center shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF1E7] text-[#FF6B00]">
            <Info className="h-7 w-7" aria-hidden="true" />
          </span>
          <p className="mt-5 text-base font-bold">CBF SOKO</p>
          <p className="mt-1 text-sm text-[#667085]">Cette page sera bientôt configurée.</p>
        </div>
      </main>
    </div>
  );
}
