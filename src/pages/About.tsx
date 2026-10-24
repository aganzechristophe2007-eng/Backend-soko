import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BadgeCheck, ShoppingBag, Store, MessageCircle, MapPin } from 'lucide-react';

export default function About() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F8F9FB] pb-20 text-[#111111] antialiased selection:bg-[#FF6B00] selection:text-white">
      <header className="sticky top-0 z-40 border-b border-[#EAECF0] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Retour"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-[#EAECF0] bg-white text-[#344054] transition-colors hover:border-[#FF6B00] hover:text-[#FF6B00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-base font-bold tracking-tight sm:text-lg">À propos de CBF SOKO</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-7 sm:px-6 sm:py-10">
        <section className="overflow-hidden rounded-3xl border border-[#EAECF0] bg-white">
          <div className="border-b border-[#EAECF0] bg-white px-6 py-8 sm:px-10 sm:py-10">
            <img src="/logo-cbf-soko.png" alt="CBF SOKO" className="mb-6 h-12 w-auto object-contain object-left" />
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#E85F00]">La marketplace locale</p>
            <h2 className="mt-2 max-w-2xl text-3xl font-bold leading-tight tracking-tight text-[#111827] sm:text-4xl">
              Acheter et vendre plus simplement, près de chez vous.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-[#667085]">
              CBF SOKO est une plateforme de commerce en ligne pensée pour faciliter la découverte de produits neufs et d’occasion, la mise en relation entre acheteurs et vendeurs et la visibilité des boutiques.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link to="/" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#FF6B00] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#E85F00]">
                Découvrir les annonces <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/create-product" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#D0D5DD] bg-white px-5 py-3 text-sm font-semibold text-[#344054] transition hover:border-[#FF6B00] hover:text-[#E85F00]">
                Publier un produit
              </Link>
            </div>
          </div>

          <div className="grid gap-0 sm:grid-cols-2">
            <div className="border-b border-[#EAECF0] p-6 sm:border-r sm:px-8 sm:py-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF1E7] text-[#FF6B00]"><ShoppingBag className="h-5 w-5" /></span>
              <h3 className="mt-4 text-base font-bold">Une offre variée</h3>
              <p className="mt-2 text-sm leading-6 text-[#667085]">Parcourez les annonces, comparez les informations disponibles et contactez le vendeur pour préciser les détails avant l’achat.</p>
            </div>
            <div className="border-b border-[#EAECF0] p-6 sm:px-8 sm:py-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF1E7] text-[#FF6B00]"><Store className="h-5 w-5" /></span>
              <h3 className="mt-4 text-base font-bold">Des boutiques et vendeurs</h3>
              <p className="mt-2 text-sm leading-6 text-[#667085]">Les vendeurs peuvent présenter leurs produits et développer leur visibilité au sein d’un espace commercial commun.</p>
            </div>
            <div className="p-6 sm:border-r sm:px-8 sm:py-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF1E7] text-[#FF6B00]"><MessageCircle className="h-5 w-5" /></span>
              <h3 className="mt-4 text-base font-bold">Un contact direct</h3>
              <p className="mt-2 text-sm leading-6 text-[#667085]">La messagerie facilite les échanges entre acheteurs et vendeurs pour poser des questions et discuter des modalités d’achat.</p>
            </div>
            <div className="p-6 sm:px-8 sm:py-7">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF1E7] text-[#FF6B00]"><MapPin className="h-5 w-5" /></span>
              <h3 className="mt-4 text-base font-bold">Un ancrage local</h3>
              <p className="mt-2 text-sm leading-6 text-[#667085]">La plateforme s’adresse notamment aux utilisateurs de Bukavu et du Sud-Kivu, avec une expérience conçue pour les réalités du commerce local.</p>
            </div>
          </div>
        </section>

        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#EAECF0] bg-white p-4 text-sm leading-6 text-[#667085]">
          <BadgeCheck className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#FF6B00]" />
          <p>Avant toute transaction, vérifiez les informations du produit et du vendeur, clarifiez le prix et convenez des modalités de remise ou de livraison. Les fonctionnalités disponibles peuvent dépendre du produit et du compte utilisé.</p>
        </div>
      </main>
    </div>
  );
}
