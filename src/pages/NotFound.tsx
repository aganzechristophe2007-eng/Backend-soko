import { ArrowLeft, Home, SearchX } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <main className="flex min-h-[100svh] items-center justify-center bg-[#F8F9FB] px-4 py-12 text-[#111111]">
      <section className="w-full max-w-lg rounded-[2rem] border border-[#EAECF0] bg-white p-7 text-center shadow-[0_18px_60px_rgba(16,24,40,0.08)] sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FFF1E7] text-[#FF6B00]">
          <SearchX className="h-8 w-8" aria-hidden="true" />
        </div>
        <p className="mt-6 text-xs font-extrabold uppercase tracking-[0.22em] text-[#FF6B00]">Erreur 404</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Cette page n’existe pas</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[#667085]">
          Le lien est peut-être incorrect ou cette page a été déplacée. Retrouvez les produits et boutiques sur CBF SOKO.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to="/" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#FF6B00] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#E85F00]">
            <Home className="h-4 w-4" aria-hidden="true" /> Retour à l’accueil
          </Link>
          <button type="button" onClick={() => navigate(-1)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#D0D5DD] bg-white px-5 py-3 text-sm font-bold text-[#344054] transition hover:border-[#FF6B00] hover:text-[#FF6B00]">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Page précédente
          </button>
        </div>
      </section>
    </main>
  );
}
