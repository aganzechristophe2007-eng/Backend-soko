import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Store, Search, ChevronRight, Package } from 'lucide-react';

export default function Boutique() {
  const navigate = useNavigate();
  const [shops] = useState([
    { id: '1', name: 'Boutique Express', category: 'Électronique', productsCount: 12 },
    { id: '2', name: 'Mode Sud-Kivu', category: 'Vêtements', productsCount: 28 }
  ]);

  return (
    <div className="min-h-screen bg-white pb-20 text-[#111111] antialiased selection:bg-[#FF6B00] selection:text-white">
      <header className="sticky top-0 z-40 border-b border-[#EAECF0] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <button
            onClick={() => navigate('/')}
            aria-label="Retour à l'accueil"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[#EAECF0] bg-white text-[#111111] transition-colors hover:border-[#FF6B00] hover:text-[#FF6B00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-tight sm:text-lg">Boutiques partenaires</h1>
            <p className="text-xs text-[#667085]">{shops.length} boutiques à découvrir</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-[#EAECF0] bg-[#FFF8F3] p-4 sm:p-5">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#FFF1E7] text-[#FF6B00]">
            <Search className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold">Achetez auprès de vendeurs de confiance</p>
            <p className="text-xs text-[#667085] sm:text-sm">Parcourez les boutiques partenaires de CBF SOKO et leurs articles.</p>
          </div>
        </div>

        {shops.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#D0D5DD] py-14 text-center text-sm text-[#667085]">
            <Store className="mx-auto mb-2 h-8 w-8 opacity-40" aria-hidden="true" />
            Aucune boutique pour le moment.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 sm:gap-4">
            {shops.map((shop) => (
              <div
                key={shop.id}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-[#EAECF0] bg-white p-4 shadow-[0_1px_3px_rgba(16,24,40,0.06)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[#FFF1E7] text-[#FF6B00]">
                    <Store className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold">{shop.name}</h2>
                    <p className="mt-0.5 truncate text-xs text-[#667085]">{shop.category}</p>
                    <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#F2F4F7] px-2 py-0.5 text-[11px] font-medium text-[#344054]">
                      <Package className="h-3 w-3" aria-hidden="true" />
                      {shop.productsCount} articles
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/shops/${shop.id}`)}
                  className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-[#FF6B00] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#E85F00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2"
                >
                  Visiter
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
