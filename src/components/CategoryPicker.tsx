import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Layers, Search, X } from 'lucide-react';

/**
 * Sélecteur de catégorie : remplace la liste déroulante basique par une fenêtre avec cases à cocher,
 * recherche et bouton Valider. Une seule catégorie peut être cochée (cocher une autre décoche la première).
 */

export interface CategoryOption {
  id: string;
  name: string;
}

interface Props {
  categories: CategoryOption[];
  value: string;
  onChange: (id: string) => void;
  label?: string;
}

export default function CategoryPicker({ categories, value, onChange, label = 'Catégorie' }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [query, setQuery] = useState('');

  const selected = categories.find((c) => c.id === value);

  const openSheet = () => {
    setDraft(value);
    setQuery('');
    setOpen(true);
  };
  const close = () => setOpen(false);
  const apply = () => {
    if (draft) onChange(draft);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories;
  }, [categories, query]);

  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-[#344054]">{label}</span>
      <button
        type="button"
        onClick={openSheet}
        aria-haspopup="dialog"
        className="flex h-12 w-full items-center gap-2.5 rounded-xl bg-white px-3.5 text-left text-sm transition-colors hover:bg-[#FFF8F3] focus-visible:bg-[#FFF8F3] focus-visible:outline-none"
      >
        <Layers className="h-4 w-4 flex-shrink-0 text-[#FF6B00]" aria-hidden="true" />
        <span className={`min-w-0 flex-1 truncate ${selected ? 'font-semibold text-[#111111]' : 'text-[#98A2B3]'}`}>
          {selected ? selected.name : 'Choisir une catégorie'}
        </span>
        <ChevronDown className="h-4 w-4 flex-shrink-0 text-[#667085]" aria-hidden="true" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 sm:items-center sm:p-4"
          onMouseDown={(e) => e.target === e.currentTarget && close()}
          role="dialog"
          aria-modal="true"
          aria-label="Choisir une catégorie"
        >
          <div className="flex max-h-[88dvh] w-full flex-col rounded-t-3xl bg-white sm:max-w-md sm:rounded-3xl">
            <div className="flex items-center gap-3 px-5 pb-2 pt-5">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold text-[#111111]">Catégorie</h2>
                <p className="text-xs text-[#667085]">Cochez la catégorie qui correspond le mieux à votre article.</p>
              </div>
              <button type="button" onClick={close} aria-label="Fermer" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F2F4F7] text-[#344054] hover:bg-[#EAECF0]">
                <X className="h-5 w-5" />
              </button>
            </div>

            {categories.length > 6 && (
              <div className="px-5 pb-2 pt-1">
                <label className="flex h-11 items-center gap-2 rounded-xl bg-[#F2F4F7] px-3 focus-within:bg-[#FFF8F3]">
                  <Search className="h-4 w-4 flex-shrink-0 text-[#667085]" aria-hidden="true" />
                  <span className="sr-only">Rechercher une catégorie</span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Rechercher"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-[#98A2B3]"
                  />
                </label>
              </div>
            )}

            <div className="flex-1 space-y-1.5 overflow-y-auto px-5 py-2" role="group" aria-label="Catégories">
              {categories.length === 0 && <p className="py-8 text-center text-sm text-[#667085]">Chargement des catégories…</p>}
              {categories.length > 0 && filtered.length === 0 && <p className="py-8 text-center text-sm text-[#667085]">Aucune catégorie ne correspond.</p>}
              {filtered.map((cat) => {
                const checked = draft === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => setDraft(cat.id)}
                    className={`flex min-h-[52px] w-full items-center gap-3 rounded-xl px-3.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:brightness-95 ${checked ? 'bg-[#FFF1E7] font-bold text-[#111111]' : 'bg-[#F2F4F7] font-medium text-[#111111] hover:bg-[#EAECF0]'}`}
                  >
                    <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md transition-colors ${checked ? 'bg-[#FF6B00] text-white' : 'bg-white'}`}>
                      {checked && <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{cat.name}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2.5 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
              <button type="button" onClick={close} className="h-12 flex-1 rounded-xl bg-[#F2F4F7] text-sm font-bold text-[#111111] hover:bg-[#EAECF0]">Annuler</button>
              <button
                type="button"
                onClick={apply}
                disabled={!draft}
                className="h-12 flex-[2] rounded-xl bg-[#FF6B00] text-sm font-bold text-white transition-colors hover:bg-[#E85F00] disabled:bg-[#D0D5DD] disabled:text-[#667085]"
              >
                Valider
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
