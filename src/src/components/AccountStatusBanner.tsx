import React, { useState } from 'react';
import { Loader2, PauseCircle } from 'lucide-react';
import { useAuth } from '../context/Authcontext';
import { api } from '../lib/http';

/**
 * Bandeau affiché partout quand le compte est en pause ou en suppression programmée :
 * un compte en pause est entièrement masqué et inactif, il faut donc un moyen évident de le réactiver.
 */
export default function AccountStatusBanner() {
  const { user, refreshUser } = useAuth() as any;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const status: string | undefined = user?.accountStatus;
  if (status !== 'PAUSED' && status !== 'PENDING_DELETION') return null;

  const reactivate = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/settings/account/reactivate', { method: 'POST', body: {} });
      await refreshUser();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Réactivation impossible pour le moment.');
    } finally {
      setBusy(false);
    }
  };

  const paused = status === 'PAUSED';
  return (
    <div role="status" className="flex flex-wrap items-center gap-3 bg-[#FF6B00] px-4 py-3 text-sm font-semibold text-white">
      <PauseCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        {paused
          ? 'Votre compte est en pause : votre profil et vos annonces sont masqués.'
          : 'La suppression de votre compte est programmée : votre profil et vos annonces sont masqués.'}
        {error && <span className="ml-2 underline">{error}</span>}
      </p>
      <button
        type="button"
        onClick={reactivate}
        disabled={busy}
        className="flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-[#C94F00] hover:bg-[#FFF1E7] focus-visible:outline-none focus-visible:brightness-95 disabled:opacity-60"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {paused ? 'Réactiver mon compte' : 'Annuler la suppression'}
      </button>
    </div>
  );
}
