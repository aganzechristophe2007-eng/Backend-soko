import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Check, CheckCircle2, ChevronRight, Eye, FolderOpen, Package, PauseCircle, Trash2, Wallet } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { api } from '../../lib/http';
import { getMediaUrl } from '../../lib/media';
import { useAuth } from '../../context/Authcontext';
import { setThemeMode, readThemeMode, THEME_MODE_OPTIONS, THEME_MODE_EVENT, type ThemeMode } from '../../lib/themeMode';
import { FONT_FAMILY_OPTIONS, TEXT_SIZE_OPTIONS, readSavedTextFamily, readSavedTextSize, saveTextPrefs } from '../../lib/textPrefs';
import type { AccountState } from '../../lib/settingsApi';
import { EvolutionDashboard, LogoutButton, PasswordChanger, ProfileEditor, RoleCard } from '../settingsExtras';
import { DangerButton, errMsg, Field, GroupLabel, inputCls, Notice, Panel, PrimaryButton, SecondaryButton, SectionHeading, Spinner } from './ui';

/* ------------------------------ Compte ------------------------------ */
export function AccountSection() {
  const { user } = useAuth() as any;
  return (
    <div className="space-y-6">
      <SectionHeading title="Informations personnelles" description="Votre nom, votre téléphone et votre rôle sur CBF SOKO." />
      {user?.email && (
        <Panel className="p-4">
          <p className="text-xs font-bold text-[#344054]">Adresse e-mail</p>
          <p className="mt-1 break-all text-sm text-[#111111]">{user.email}</p>
          <p className="mt-1 text-xs text-[#667085]">Votre e-mail sert à vous connecter. Il ne peut pas être modifié ici.</p>
        </Panel>
      )}
      <div><GroupLabel>Profil</GroupLabel><ProfileEditor /></div>
      <div><GroupLabel>Mon rôle</GroupLabel><RoleCard /></div>
      {user?.id && (
        <Link to={`/users/${user.id}`} className="flex h-12 items-center justify-center rounded-xl bg-[#EAECF0] text-sm font-bold text-[#111111] hover:bg-[#D0D5DD]">
          Voir mon profil public
        </Link>
      )}
    </div>
  );
}

/* ------------------------------ Sécurité ------------------------------ */
export function SecuritySection() {
  return (
    <div className="space-y-6">
      <SectionHeading title="Sécurité" description="Choisissez un mot de passe que vous n'utilisez nulle part ailleurs." />
      <PasswordChanger />
      <div><GroupLabel>Session</GroupLabel><LogoutButton /></div>
    </div>
  );
}

/* ------------------------------ Paiements ------------------------------ */
export function PaymentsSection() {
  return (
    <div className="space-y-4">
      <SectionHeading title="Paiements" description="Votre portefeuille et les frais appliqués sur CBF SOKO." />
      <Link to="/wallet" className="flex items-center gap-3 rounded-2xl bg-[#F2F4F7] p-4 hover:bg-[#EAECF0]">
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#FFF1E7] text-[#FF6B00]"><Wallet className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Mon portefeuille</p>
          <p className="text-xs text-[#667085]">Solde, paiements reçus et retraits</p>
        </div>
        <ChevronRight className="h-5 w-5 flex-shrink-0 text-[#98A2B3]" aria-hidden="true" />
      </Link>
      <Panel className="space-y-2 p-4 text-sm">
        <div className="flex justify-between gap-4"><span className="text-[#667085]">Livraison</span><span className="font-semibold">2 000 FC</span></div>
        <div className="flex justify-between gap-4"><span className="text-[#667085]">Retrait chez le vendeur</span><span className="font-semibold">Gratuit</span></div>
        <div className="flex justify-between gap-4"><span className="text-[#667085]">Commission de la plateforme</span><span className="font-semibold">0,5 %</span></div>
      </Panel>
    </div>
  );
}

/* ------------------------------ Mes annonces ------------------------------ */
interface MyProduct { id: string; title: string; priceUSD: number; images?: string[]; views?: number; status?: string }

export function ListingsSection() {
  const { user } = useAuth() as any;
  const [items, setItems] = useState<MyProduct[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiFetch('/settings/products')
      .then((res: any) => {
        if (cancelled) return;
        const list = res?.data ?? res?.products ?? res ?? [];
        setItems(Array.isArray(list) ? list : []);
      })
      .catch((e: unknown) => { if (!cancelled) setError(errMsg(e, 'Impossible de charger vos annonces.')); });
    return () => { cancelled = true; };
  }, [user]);

  const chart = useMemo(() => {
    const top = [...(items ?? [])].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 6);
    return { top, max: Math.max(1, ...top.map((p) => p.views ?? 0)) };
  }, [items]);

  const markSold = async (id: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/settings/products/${id}/sold`, { method: 'PATCH' });
      setItems((prev) => prev?.map((p) => (p.id === id ? { ...p, status: 'SOLD' } : p)) ?? prev);
    } catch (e) { setError(errMsg(e, "Impossible de marquer l'annonce comme vendue.")); } finally { setBusyId(null); }
  };
  const remove = async (id: string) => {
    setBusyId(id);
    try {
      await apiFetch(`/settings/products/${id}`, { method: 'DELETE' });
      setItems((prev) => prev?.filter((p) => p.id !== id) ?? prev);
    } catch (e) { setError(errMsg(e, "Impossible de supprimer l'annonce.")); } finally { setBusyId(null); setConfirmId(null); }
  };

  return (
    <div className="space-y-4">
      <SectionHeading title="Mes annonces" description="Marquez-les vendues ou supprimez-les." />
      {error && <Notice tone="error">{error}</Notice>}
      {items === null && !error ? <Spinner label="Chargement de vos annonces..." /> : null}
      {items && items.length === 0 && (
        <Panel className="flex flex-col items-center gap-2 p-6 text-center">
          <Package className="h-8 w-8 text-[#98A2B3]" aria-hidden="true" />
          <p className="text-sm text-[#667085]">Vous n'avez publié aucune annonce pour le moment.</p>
          <Link to="/create-product" className="mt-1 text-sm font-bold text-[#FF6B00] hover:underline">Publier une annonce</Link>
        </Panel>
      )}
      {items && items.length > 0 && (
        <Panel>
          {items.map((p, i) => {
            const sold = p.status === 'SOLD';
            const busy = busyId === p.id;
            return (
              <div key={p.id}>
                {i > 0 && <div className="mx-4 h-px bg-[#EAECF0]" aria-hidden="true" />}
                <div className="flex items-center gap-3 p-3">
                  <span className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-[#EAECF0]">
                    {p.images?.[0] ? <img src={getMediaUrl(p.images[0])} alt={p.title} className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[#667085]"><Package className="h-5 w-5" /></span>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.title}</p>
                    <p className="text-sm font-bold text-[#FF6B00]">{p.priceUSD} $</p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-[#667085]">
                      <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {p.views ?? 0}</span>
                      {sold && <span className="rounded-full bg-green-50 px-2 py-0.5 font-semibold text-green-600">Vendue</span>}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    {!sold && (
                      <button type="button" onClick={() => markSold(p.id)} disabled={busy} aria-label="Déclarer vendue" title="Déclarer vendue" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-green-600 hover:bg-[#EAECF0] disabled:opacity-50">
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    )}
                    <button type="button" onClick={() => setConfirmId(p.id)} disabled={busy} aria-label="Supprimer l'annonce" title="Supprimer" className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-red-600 hover:bg-[#EAECF0] disabled:opacity-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {confirmId === p.id && (
                  <div className="mx-3 mb-3 space-y-2 rounded-xl bg-white p-3">
                    <p className="text-sm font-semibold">Supprimer cette annonce ? Cette action est définitive.</p>
                    <div className="flex gap-2">
                      <SecondaryButton onClick={() => setConfirmId(null)} className="h-10 flex-1">Annuler</SecondaryButton>
                      <DangerButton onClick={() => remove(p.id)} busy={busy} className="h-10 flex-1">Supprimer</DangerButton>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </Panel>
      )}

      {chart.top.length > 0 && (
        <div>
          <GroupLabel>Vues par annonce</GroupLabel>
          <Panel className="space-y-3 p-4">
            {chart.top.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className="w-24 flex-shrink-0 truncate text-xs text-[#667085] sm:w-36">{p.title}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#EAECF0]">
                  <div className="h-full rounded-full bg-[#FF6B00]" style={{ width: `${Math.max(4, ((p.views ?? 0) / chart.max) * 100)}%` }} />
                </div>
                <span className="w-9 flex-shrink-0 text-right text-xs font-bold">{p.views ?? 0}</span>
              </div>
            ))}
          </Panel>
        </div>
      )}
    </div>
  );
}

export function EvolutionSection() {
  return (
    <div className="space-y-4">
      <SectionHeading title="Mon évolution" description="Vos vues, ventes, revenus et achats au fil du temps." />
      <EvolutionDashboard />
    </div>
  );
}

/* ------------------------------ Affichage ------------------------------ */
const PRESET_BACKGROUNDS = [
  { id: '0', name: 'Blanc classique', value: '#FFFFFF' },
  { id: '1', name: 'Marché Vivant', value: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.85)), url("https://images.unsplash.com/photo-1533900298318-6b8da08a523e?auto=format&fit=crop&w=1200&q=80")' },
  { id: '2', name: 'Boutique Textile', value: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.85)), url("https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80")' },
  { id: '3', name: 'Colis & Livraison', value: 'linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.88)), url("https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80")' },
  { id: '4', name: 'Étal de Fruits', value: 'linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.85)), url("https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1200&q=80")' },
  { id: '5', name: 'Électronique', value: 'linear-gradient(rgba(0,0,0,0.65), rgba(0,0,0,0.9)), url("https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&q=80")' },
  { id: '6', name: 'Mode & Style', value: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.85)), url("https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=1200&q=80")' },
  { id: '7', name: 'Sacs & Accessoires', value: 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.85)), url("https://images.unsplash.com/photo-1524498372554-4e1c1c2c1611?auto=format&fit=crop&w=1200&q=80")' },
  { id: '8', name: 'Caisse & Paiement', value: 'linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.88)), url("https://images.unsplash.com/photo-1556740738-b6a63e27c4df?auto=format&fit=crop&w=1200&q=80")' },
  { id: '9', name: 'Minimaliste Noir', value: '#080808' },
  { id: '10', name: 'Ambre CBFSOKO', value: 'linear-gradient(135deg, #451a03 0%, #09090b 100%)' },
  { id: '11', name: 'Émeraude', value: 'linear-gradient(135deg, #064e3b 0%, #022c22 100%)' },
  { id: '12', name: 'Gris Métallique', value: 'linear-gradient(135deg, #1c1c1e 0%, #0a0a0a 100%)' },
];

const BG_KEY = 'cbfsoko-custom-bg';

export function DisplaySection() {
  const [mode, setMode] = useState<ThemeMode>(() => readThemeMode());
  const [size, setSize] = useState<number>(() => readSavedTextSize());
  const [family, setFamily] = useState<string>(() => readSavedTextFamily());
  const [bg, setBg] = useState<string>(() => {
    const saved = localStorage.getItem(BG_KEY);
    return !saved || saved.toLowerCase() === '#080808' || saved.toLowerCase() === '#000000' ? '#FFFFFF' : saved;
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sync = () => setMode(readThemeMode());
    window.addEventListener(THEME_MODE_EVENT, sync);
    return () => window.removeEventListener(THEME_MODE_EVENT, sync);
  }, []);

  const chooseBg = (value: string) => {
    setBg(value);
    localStorage.setItem(BG_KEY, value);
    window.dispatchEvent(new Event('storage-bg-change'));
  };
  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      if (result) chooseBg(`linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.85)), url("${result}")`);
    };
    reader.readAsDataURL(file);
  };

  const seg = (active: boolean) =>
    `h-11 flex-1 rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:brightness-90 ${active ? 'bg-[#FF6B00] text-white' : 'text-[#344054] hover:bg-[#D0D5DD]'}`;
  const group = 'flex gap-1 rounded-xl bg-[#EAECF0] p-1';

  return (
    <div className="space-y-6">
      <SectionHeading title="Affichage" description="Thème, texte et arrière-plan de l'accueil." />
      <div>
        <GroupLabel>Mode d'affichage</GroupLabel>
        <div role="radiogroup" aria-label="Mode d'affichage" className={group}>
          {THEME_MODE_OPTIONS.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={mode === o.id} onClick={() => { setMode(o.id); setThemeMode(o.id); }} className={seg(mode === o.id)}>{o.label}</button>
          ))}
        </div>
      </div>
      <div>
        <GroupLabel>Taille du texte</GroupLabel>
        <div role="radiogroup" aria-label="Taille du texte" className={group}>
          {TEXT_SIZE_OPTIONS.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={size === o.px} onClick={() => { setSize(o.px); saveTextPrefs(o.px, family); }} className={seg(size === o.px)} style={{ fontSize: `${Math.min(o.px, 16)}px` }}>{o.label}</button>
          ))}
        </div>
      </div>
      <div>
        <GroupLabel>Police d'écriture</GroupLabel>
        <div role="radiogroup" aria-label="Police d'écriture" className={group}>
          {FONT_FAMILY_OPTIONS.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={family === o.value} onClick={() => { setFamily(o.value); saveTextPrefs(size, o.value); }} className={seg(family === o.value)} style={{ fontFamily: o.value }}>{o.label}</button>
          ))}
        </div>
      </div>
      <div>
        <GroupLabel>Arrière-plan de l'accueil (mode clair)</GroupLabel>
        <div className="mb-3 grid grid-cols-2 gap-2.5">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={pickFile} className="hidden" />
          <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} className="hidden" />
          <SecondaryButton onClick={() => cameraRef.current?.click()} className="h-11"><Camera className="h-4 w-4" /> Caméra</SecondaryButton>
          <SecondaryButton onClick={() => fileRef.current?.click()} className="h-11"><FolderOpen className="h-4 w-4" /> Explorateur</SecondaryButton>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {PRESET_BACKGROUNDS.map((p) => {
            const selected = bg === p.value;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => chooseBg(p.value)}
                aria-pressed={selected}
                aria-label={p.name}
                className={`relative flex h-20 flex-col items-center justify-end overflow-hidden rounded-xl p-1.5 text-center text-[10px] font-semibold text-white transition-opacity focus-visible:outline-none focus-visible:brightness-90 hover:opacity-90`}
                style={{ background: p.value, backgroundSize: 'cover' }}
              >
                <span className="relative z-10 w-full truncate rounded bg-black/70 px-1 py-0.5">{p.name}</span>
                {selected && (
                  <span className="absolute right-1.5 top-1.5 z-10 rounded-full bg-[#FF6B00] p-1 text-white"><Check className="h-3.5 w-3.5" /></span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Zone sensible : pause / suppression ------------------------------ */
interface DangerProps { account: AccountState | null; onChange: (a: AccountState) => void }

export function DangerSection({ account, onChange }: DangerProps) {
  const { refreshUser } = useAuth() as any;
  const [mode, setMode] = useState<'none' | 'pause' | 'delete'>('none');
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!account) return <Spinner label="Chargement..." />;

  const reset = () => { setMode('none'); setPassword(''); setConfirmText(''); setError(''); };
  const run = async (path: string, body?: unknown) => {
    setBusy(true);
    setError('');
    try {
      const res = await api<{ account: AccountState }>(path, { method: 'POST', body: body ?? {} });
      onChange(res.account);
      if (typeof refreshUser === 'function') await refreshUser();
      reset();
    } catch (e) {
      setError(errMsg(e, 'Action impossible pour le moment.'));
    } finally {
      setBusy(false);
    }
  };

  if (account.status === 'PAUSED') {
    return (
      <div className="space-y-4">
        <SectionHeading title="Zone sensible" />
        <Panel className="space-y-3 p-4">
          <p className="flex items-center gap-2 text-sm font-bold"><PauseCircle className="h-5 w-5 text-[#FF6B00]" aria-hidden="true" /> Votre compte est en pause</p>
          <p className="text-sm text-[#667085]">Votre profil, votre boutique et vos annonces sont masqués. Vous ne recevez ni messages ni notifications.</p>
          {error && <Notice tone="error">{error}</Notice>}
          <PrimaryButton onClick={() => run('/settings/account/reactivate')} busy={busy} className="w-full">Réactiver mon compte</PrimaryButton>
        </Panel>
      </div>
    );
  }

  if (account.status === 'PENDING_DELETION') {
    return (
      <div className="space-y-4">
        <SectionHeading title="Zone sensible" />
        <Panel className="space-y-3 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-red-600"><Trash2 className="h-5 w-5" aria-hidden="true" /> Suppression programmée</p>
          <p className="text-sm text-[#667085]">
            Votre compte sera supprimé définitivement
            {account.deletionScheduledAt ? ` le ${new Date(account.deletionScheduledAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
            {account.daysLeft !== null ? ` (dans ${account.daysLeft} jour${account.daysLeft > 1 ? 's' : ''})` : ''}. D'ici là, il reste masqué et vous pouvez annuler.
          </p>
          {error && <Notice tone="error">{error}</Notice>}
          <PrimaryButton onClick={() => run('/settings/account/reactivate')} busy={busy} className="w-full">Annuler la suppression</PrimaryButton>
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeading title="Zone sensible" description="Ces actions demandent votre mot de passe." />

      <Panel className="space-y-3 p-4">
        <p className="flex items-center gap-2 text-sm font-bold"><PauseCircle className="h-5 w-5 text-[#FF6B00]" aria-hidden="true" /> Mettre mon compte en pause</p>
        <p className="text-sm text-[#667085]">Tout est masqué : profil, boutique et annonces. Plus de messages ni de notifications. Vous réactivez votre compte quand vous voulez, en vous reconnectant puis en touchant « Réactiver ».</p>
        {mode === 'pause' ? (
          <div className="space-y-3">
            <Field label="Mot de passe"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={inputCls} /></Field>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="flex gap-2">
              <SecondaryButton onClick={reset} className="flex-1">Annuler</SecondaryButton>
              <PrimaryButton onClick={() => run('/settings/account/pause', { password })} busy={busy} disabled={!password} className="flex-1">Mettre en pause</PrimaryButton>
            </div>
          </div>
        ) : (
          <SecondaryButton onClick={() => { reset(); setMode('pause'); }} className="w-full">Mettre en pause</SecondaryButton>
        )}
      </Panel>

      <Panel className="space-y-3 p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-red-600"><Trash2 className="h-5 w-5" aria-hidden="true" /> Supprimer mon compte</p>
        <p className="text-sm text-[#667085]">Votre compte est masqué tout de suite et supprimé définitivement après 30 jours. Pendant ce délai, vous pouvez annuler. Impossible s'il reste des commandes en cours ou de l'argent dans votre portefeuille.</p>
        {mode === 'delete' ? (
          <div className="space-y-3">
            <Field label="Mot de passe"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={inputCls} /></Field>
            <Field label="Tapez SUPPRIMER pour confirmer"><input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className={inputCls} /></Field>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="flex gap-2">
              <SecondaryButton onClick={reset} className="flex-1">Annuler</SecondaryButton>
              <DangerButton onClick={() => run('/settings/account/delete-request', { password, confirm: confirmText })} busy={busy} disabled={!password || confirmText !== 'SUPPRIMER'} className="flex-1">Supprimer</DangerButton>
            </div>
          </div>
        ) : (
          <DangerButton onClick={() => { reset(); setMode('delete'); }} className="w-full">Supprimer mon compte</DangerButton>
        )}
      </Panel>
    </div>
  );
}
