import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// Page volontairement minimale : à compléter plus tard (contenu à définir).
export default function About() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 pb-20">
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-900/90 px-4 py-3 flex items-center space-x-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-neutral-800 transition text-neutral-400 hover:text-neutral-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-base">À propos</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-10 text-center text-neutral-400">
        <p className="text-sm">Cette page sera bientôt configurée.</p>
      </main>
    </div>
  );
}