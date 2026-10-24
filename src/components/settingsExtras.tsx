import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, KeyRound, Pencil, TrendingUp, LogOut, Loader2, Check, AlertTriangle, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../context/Authcontext';
import { apiFetch } from '../api/client';

const ROLE_LABELS: Record<string, { label: string; hint: string }> = {
  USER: { label: 'Membre', hint: 'Vous pouvez acheter et vendre sur CBF SOKO.' },
  COURIER: { label: 'Livreur CBFSOKO', hint: 'Vous récupérez et vérifiez les articles avant le paiement.' },
  ADMIN: { label: 'Administrateur', hint: 'Accès au tableau de bord de la plateforme.' },
  ADMIN_FINANCE: { label: 'Administrateur financier', hint: 'Suivi des paiements de la plateforme.' },
  SUPER_ADMIN: { label: 'Super administrateur', hint: 'Accès complet à la plateforme.' },
};

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];
const card = 'rounded-2xl border border-[#EAECF0] bg-white p-4';
const input =
  'h-12 w-full rounded-xl border border-[#D0D5DD] bg-white px-3 text-sm text-[#111111] outline-none placeholder:text-[#98A2B3] focus:border-[#FF6B00] focus:ring-2 focus:ring-[#FF6B00]/20 disabled:bg-[#F9FAFB]';
const primaryBtn =
  'flex h-12 items-center justify-center gap-2 rounded-xl bg-[#FF6B00] px-5 text-sm font-bold text-white transition-colors hover:bg-[#E85F00] disabled:opacity-60';

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/* ------------------------------ Rôle + lien admin ------------------------------ */
export function RoleCard() {
  const { user, refreshUser } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  if (!user) return null;

  const info = ROLE_LABELS[user.role] ?? { label: String(user.role ?? 'Membre'), hint: '' };
  const isAdmin = ADMIN_ROLES.includes(user.role);

  const refresh = async () => {
    setRefreshing(true);
    await refreshUser();
    setRefreshing(false);
  };

  return (
    <div className={card}>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#FFF1E7] text-[#FF6B00]">
          <Shield className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[#667085]">Votre rôle actuel</p>
          <p className="text-base font-extrabold text-[#111111]">{info.label}</p>
          {info.hint && <p className="mt-0.5 text-xs text-[#667085]">{info.hint}</p>}
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="flex-shrink-0 rounded-full bg-[#F2F4F7] px-3 py-1.5 text-[11px] font-bold text-[#111111] hover:bg-[#EAECF0] disabled:opacity-60"
        >
          {refreshing ? '...' : 'Actualiser'}
        </button>
      </div>

      {isAdmin && (
        <Link
          to="/admin-seller"
          className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#FF6B00] py-2.5 text-sm font-bold text-white hover:bg-[#E85F00]"
        >
          <LayoutDashboard className="h-4 w-4" /> Ouvrir l'administration
        </Link>
      )}
    </div>
  );
}

/* ------------------------------ Modifier le profil ------------------------------ */
export function ProfileEditor() {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(user?.name ?? '');
    setPhone(user?.phone ?? '');
  }, [user?.name, user?.phone]);

  if (!user) return null;

  const dirty = name.trim() !== (user.name ?? '') || phone.trim() !== (user.phone ?? '');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await apiFetch('/settings/profile', { method: 'PATCH', body: JSON.stringify({ name: name.trim(), phone: phone.trim() }) });
      await refreshUser();
      setSaved(true);
    } catch (err: unknown) {
      setError(errMsg(err, 'Impossible de modifier le profil.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`${card} space-y-3`}>
      <p className="flex items-center gap-1.5 text-xs font-bold text-[#344054]">
        <Pencil className="h-3.5 w-3.5 text-[#FF6B00]" /> Informations personnelles
      </p>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-[#667085]">Nom</label>
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-[#667085]">Téléphone</label>
        <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} inputMode="tel" autoComplete="tel" placeholder="+243 ..." />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-[#667085]">E-mail (non modifiable)</label>
        <input className={`${input} opacity-60`} value={user.email ?? ''} disabled readOnly />
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
        </p>
      )}
      {saved && !dirty && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
          <Check className="h-3.5 w-3.5" /> Profil mis à jour.
        </p>
      )}
      <button type="submit" disabled={busy || !dirty} className={primaryBtn}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer
      </button>
    </form>
  );
}

/* ------------------------------ Mot de passe ------------------------------ */
export function PasswordChanger() {
  const { user } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  if (!user) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDone(false);
    if (next.length < 8) return setError('Le nouveau mot de passe doit contenir au moins 8 caractères.');
    if (next !== confirm) return setError('La confirmation ne correspond pas.');
    setBusy(true);
    try {
      await apiFetch('/settings/password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (err: unknown) {
      setError(errMsg(err, 'Impossible de changer le mot de passe.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`${card} space-y-3`}>
      <p className="flex items-center gap-1.5 text-xs font-bold text-[#344054]">
        <KeyRound className="h-3.5 w-3.5 text-[#FF6B00]" /> Changer le mot de passe
      </p>
      <input type="password" className={input} placeholder="Mot de passe actuel" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" maxLength={200} />
      <input type="password" className={input} placeholder="Nouveau mot de passe (8 caractères minimum)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" maxLength={72} />
      <input type="password" className={input} placeholder="Confirmer le nouveau mot de passe" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" maxLength={72} />
      {error && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
        </p>
      )}
      {done && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
          <Check className="h-3.5 w-3.5" /> Mot de passe modifié.
        </p>
      )}
      <button type="submit" disabled={busy || !current || !next || !confirm} className={primaryBtn}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Modifier le mot de passe
      </button>
    </form>
  );
}

/* ------------------------------ Tableau de bord personnel ------------------------------ */
type DayPoint = { day: string; views: number; sales: number; revenueUSD: number; purchases: number };
type Dashboard = {
  days: number;
  memberSince: string | null;
  series: DayPoint[];
  totals: { views: number; sales: number; revenueUSD: number; purchases: number };
  profile: { productsCount: number; followers: number; following: number; ratingAvg: number | null; ratingCount: number };
};

const METRICS = [
  { key: 'views', label: 'Vues' },
  { key: 'sales', label: 'Ventes' },
  { key: 'revenueUSD', label: 'Revenus ($)' },
  { key: 'purchases', label: 'Achats' },
] as const;
type MetricKey = (typeof METRICS)[number]['key'];

const nf = new Intl.NumberFormat('fr-FR');
const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

function AreaChart({ points, metric }: { points: DayPoint[]; metric: MetricKey }) {
  const W = 320;
  const H = 120;
  const PAD = 6;
  const values = points.map((p) => p[metric]);
  const max = Math.max(1, ...values);
  const step = points.length > 1 ? (W - PAD * 2) / (points.length - 1) : 0;
  const xy = values.map((v, i) => [PAD + i * step, H - PAD - (v / max) * (H - PAD * 2)] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = xy.length ? `${PAD},${H - PAD} ${line} ${PAD + (xy.length - 1) * step},${H - PAD}` : '';

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full text-[#667085]" role="img" aria-label="Évolution sur la période">
        {[0.25, 0.5, 0.75].map((r) => (
          <line key={r} x1={PAD} x2={W - PAD} y1={H - PAD - r * (H - PAD * 2)} y2={H - PAD - r * (H - PAD * 2)} stroke="currentColor" strokeOpacity={0.14} />
        ))}
        {area && <polygon points={area} fill="rgba(255,107,0,0.14)" />}
        {line && <polyline points={line} fill="none" stroke="#FF6B00" strokeWidth={2} strokeLinejoin="round" />}
        {xy.map(([x, y], i) => (
          <circle key={points[i].day} cx={x} cy={y} r={points.length > 40 ? 1.2 : 2.2} fill="#FF6B00">
            <title>{`${shortDate(points[i].day)} : ${nf.format(values[i])}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex justify-between text-[10px] font-semibold text-[#98A2B3]">
        <span>{points.length ? shortDate(points[0].day) : ''}</span>
        <span>max {nf.format(max)}</span>
        <span>{points.length ? shortDate(points[points.length - 1].day) : ''}</span>
      </div>
    </div>
  );
}

export function EvolutionDashboard() {
  const { user } = useAuth();
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [metric, setMetric] = useState<MetricKey>('views');
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setError('');
    apiFetch(`/settings/dashboard?days=${days}`)
      .then((res: any) => {
        if (!cancelled) setData(res?.data ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errMsg(err, 'Impossible de charger votre évolution.'));
      });
    return () => {
      cancelled = true;
    };
  }, [user, days]);

  const memberSince = useMemo(() => {
    if (!data?.memberSince) return null;
    return new Date(data.memberSince).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });
  }, [data?.memberSince]);

  if (!user) return null;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {([7, 30, 90] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={`flex-1 rounded-full py-2 text-xs font-bold transition-colors ${days === d ? 'bg-[#FF6B00] text-white' : 'bg-[#F2F4F7] text-[#111111] hover:bg-[#EAECF0]'}`}
          >
            {d} jours
          </button>
        ))}
      </div>

      {error && (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
          <AlertTriangle className="h-3.5 w-3.5" /> {error}
        </p>
      )}

      {!data && !error ? (
        <div className={`${card} flex items-center gap-2 text-sm text-[#667085]`}>
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement...
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMetric(m.key)}
                className={`rounded-xl p-3 text-left transition-colors ${metric === m.key ? 'bg-[#FFF1E7] ring-1 ring-[#FF6B00]' : 'border border-[#EAECF0] bg-white hover:bg-[#F9FAFB]'}`}
              >
                <p className="text-[11px] font-semibold text-[#667085]">{m.label}</p>
                <p className="mt-1 text-lg font-extrabold text-[#111111]">
                  {m.key === 'revenueUSD' ? `${nf.format(data.totals.revenueUSD)} $` : nf.format(data.totals[m.key])}
                </p>
              </button>
            ))}
          </div>

          <div className={card}>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#344054]">
              <TrendingUp className="h-3.5 w-3.5 text-[#FF6B00]" /> {METRICS.find((m) => m.key === metric)?.label} sur {data.days} jours
            </p>
            <AreaChart points={data.series} metric={metric} />
            <p className="mt-2 text-[10px] text-[#98A2B3]">Revenus = total brut des commandes payées, avant commission de la plateforme.</p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className={`${card} text-center`}>
              <p className="text-lg font-extrabold text-[#111111]">{data.profile.productsCount}</p>
              <p className="text-[11px] font-semibold text-[#667085]">Annonces</p>
            </div>
            <div className={`${card} text-center`}>
              <p className="text-lg font-extrabold text-[#111111]">{data.profile.followers}</p>
              <p className="text-[11px] font-semibold text-[#667085]">Abonnés</p>
            </div>
            <div className={`${card} text-center`}>
              <p className="text-lg font-extrabold text-[#111111]">{data.profile.ratingAvg ?? '—'}</p>
              <p className="text-[11px] font-semibold text-[#667085]">Note ({data.profile.ratingCount})</p>
            </div>
            <div className={`${card} text-center`}>
              <p className="text-sm font-extrabold text-[#111111]">{memberSince ?? '—'}</p>
              <p className="text-[11px] font-semibold text-[#667085]">Membre depuis</p>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------------ Déconnexion ------------------------------ */
export function LogoutButton() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const doLogout = async () => {
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
      navigate('/login', { replace: true });
    }
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-50 text-sm font-bold text-red-600 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
      >
        <LogOut className="h-4 w-4" /> Se déconnecter
      </button>
    );
  }
  return (
    <div className={card}>
      <p className="text-sm font-bold text-[#111111]">Se déconnecter de CBF SOKO ?</p>
      <div className="mt-3 flex gap-2.5">
        <button type="button" onClick={() => setConfirming(false)} className="h-11 flex-1 rounded-xl bg-[#F2F4F7] text-sm font-bold text-[#111111] hover:bg-[#EAECF0]">
          Annuler
        </button>
        <button type="button" onClick={doLogout} disabled={busy} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Déconnexion
        </button>
      </div>
    </div>
  );
}