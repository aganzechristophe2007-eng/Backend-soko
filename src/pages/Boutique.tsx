import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Store, Search } from 'lucide-react';

export default function Boutique() {
  const navigate = useNavigate();
  const [shops] = useState([
    { id: '1', name: 'Boutique Express', category: 'Électronique', productsCount: 12 },
    { id: '2', name: 'Mode Sud-Kivu', category: 'Vêtements', productsCount: 28 }
  ]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 pb-20">
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-900/90 px-4 py-3 flex items-center space-x-3">
        <button onClick={() => navigate('/')} className="p-1.5 rounded-lg hover:bg-neutral-800 transition text-neutral-400 hover:text-neutral-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-bold text-base">Boutiques partenaires</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {shops.map((shop) => (
          <div key={shop.id} className="p-4 rounded-xl border border-neutral-800 bg-neutral-900 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-orange-600/20 text-orange-600 flex items-center justify-center font-bold">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-semibold text-sm">{shop.name}</h2>
                <span className="text-xs text-neutral-400">{shop.category} • {shop.productsCount} articles</span>
              </div>
            </div>
            <button 
              onClick={() => navigate(`/shops/${shop.id}`)}
              className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium rounded-lg transition"
            >
              Visiter
            </button>
          </div>
        ))}
      </main>
    </div>
  );
}