import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BASE_URL } from '../api/client';
import { useAuth } from '../context/Authcontext';

/* ---------- Constantes ---------- */
const ROOT = String(BASE_URL || '').replace(/\/+$/, '').replace(/\/api$/, '');
const ENDPOINT = `${ROOT}/api/admin-seller/dashboard`;
const REFRESH_MS = 60_000;

const C = {
  page: '#121212',
  panel: '#181818',
  border: '#2C2C2C',
  green: '#22C55E',
  orange: '#F97316',
  red: '#EF4444',
  muted: '#9CA3AF',
};

const STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'En attente', color: '#FACC15' },
  AWAITING_SELLER_CONFIRMATION: { label: 'Attente vendeur', color: '#F97316' },
  CONFIRMED: { label: 'Confirmées', color: '#3B82F6' },
  COURIER_VERIFIED: { label: 'Vérifiées', color: '#14B8A6' },
  SHIPPED: { label: 'Expédiées', color: '#A855F7' },
  DELIVERED: { label: 'Livrées', color: '#22C55E' },
  CANCELLED: { label: 'Annulées', color: '#EF4444' },
  EXPIRED: { label: 'Expirées', color: '#9CA3AF' },
};
const statusMeta = (s: string) => STATUS[s] ?? { label: s, color: C.muted };
const PIE_COLORS = ['#22C55E', '#EF4444', '#FACC15', '#3B82F6', '#A855F7', '#F97316'];

/* ---------- Types (reflet de la réponse de l'API) ---------- */
interface Person { id: string; name: string; phone: string | null; avatar: string | null }
interface OrderDto {
  id: string;
  status: string;
  totalUSD: number;
  totalCDF: number;
  deliveryAddress: string | null;
  createdAt: string;
  expiresAt: string | null;
  itemsCount: number;
  buyer: { id: string; name: string };
  courier: Person | null;
  product: { id: string; title: string; image: string | null } | null;
  seller: (Person & { shopName: string | null }) | null;
}
interface SellerStats { rating: number | null; reviewsCount: number; availableProducts: number }
interface Metric { total: number; previous: number; deltaPct: number | null; series: number[] }
interface DashboardData {
  generatedAt: string;
  viewer: { name: string; role: string };
  badges: { ordersAwaitingSeller: number; shopsUnverified: number };
  kpis: {
    ordersToday: number;
    ordersAwaitingVerification: number;
    activeSellers: number;
    totalRevenueUSD: number;
    totalRevenueCDF: number;
  };
  attentionOrders: OrderDto[];
  recentOrders: OrderDto[];
  shops: {
    total: number;
    items: (SellerStats & {
      id: string; name: string; description: string | null; logo: string | null; verified: boolean; owner: Person;
    })[];
  };
  individualSellers: { total: number; items: (SellerStats & Person & { createdAt: string })[] };
  couriers: { total: number; deliveries: OrderDto[] };
  weekly: {
    days: string[];
    orders: Metric;
    newClients: Metric;
    revenueUSD: Metric;
    statusDistribution: { status: string; count: number }[];
    popularCategories: { id: string; name: string; quantity: number }[];
    topSellers: { id: string; name: string; orders: number }[];
    peakHours: { hour: number; orders: number }[];
  };
}

type View = 'dashboard' | 'orders' | 'verifications' | 'sellers' | 'couriers' | 'stats';

/* ---------- Utilitaires ---------- */
const usd = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);
const cdf = (n: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n)} FC`;
const num = (n: number) => new Intl.NumberFormat('fr-FR').format(n);

const elapsed = (iso: string) => {
  const min = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)}h`;
  return `${Math.floor(min / 1440)}j`;
};
const shortDate = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const waHref = (phone: string | null) => {
  const digits = (phone || '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : null;
};
// Seules les images en https sont affichées (pas de data:, javascript:, http: ni URL relative contrôlée par un tiers)
const safeUrl = (u?: string | null) => (u && /^https:\/\//i.test(u) ? u : null);
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];
const has = (q: string, ...fields: (string | null | undefined)[]) =>
  !q || fields.some((f) => (f || '').toLowerCase().includes(q));

/* ---------- Icônes ---------- */
const PATHS: Record<string, string> = {
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  orders: 'M3 7h18v13H3zM3 7l2-3h14l2 3M16 13h2',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  users: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 010 6M18 14c2 .7 3 2.8 3 6',
  route: 'M6 19a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM8 17h6a3 3 0 000-6h-4a3 3 0 010-6h6',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  bell: 'M6 9a6 6 0 0112 0c0 6 2 7 2 7H4s2-1 2-7zM10 20a2 2 0 004 0',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
  chat: 'M4 5h16v11H9l-5 4z',
  chevron: 'M9 6l6 6-6 6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  store: 'M4 9l2-5h12l2 5M4 9v11h16V9M4 9h16M9 20v-6h6v6',
  refresh: 'M20 11a8 8 0 10-2 6M20 5v6h-6',
};
const Icon = ({ name, size = 20 }: { name: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={PATHS[name]} />
  </svg>
);

/* ---------- Petits composants ---------- */
const Avatar = ({ src, name, size = 40 }: { src?: string | null; name: string; size?: number }) =>
  safeUrl(src) ? (
    <img src={safeUrl(src)!} alt="" width={size} height={size} referrerPolicy="no-referrer" loading="lazy" className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full flex items-center justify-center font-semibold text-white shrink-0" style={{ width: size, height: size, background: '#3F3F46' }}>
      {(name || '?').trim().charAt(0).toUpperCase()}
    </div>
  );

const Panel = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-xl ${className}`} style={{ background: C.panel, border: `1px solid ${C.border}` }}>{children}</div>
);

const Empty = ({ text }: { text: string }) => (
  <div className="px-6 py-12 text-center text-sm" style={{ color: C.muted }}>{text}</div>
);

const Contact = ({ phone, userId }: { phone: string | null; userId?: string }) => {
  const navigate = useNavigate();
  const wa = waHref(phone);
  return (
    <div className="flex items-center gap-2 shrink-0">
      {userId && (
        <button type="button" onClick={() => navigate(`/users/${userId}`)} title="Ouvrir le profil" className="h-9 w-9 rounded-lg flex items-center justify-center text-white" style={{ background: C.orange }}>
          <Icon name="chat" size={18} />
        </button>
      )}
      {wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer" className="h-9 px-3 rounded-lg flex items-center text-sm font-semibold text-white" style={{ background: '#16A34A' }}>
          WhatsApp
        </a>
      ) : (
        <span className="h-9 px-3 rounded-lg flex items-center text-sm font-semibold" style={{ background: '#27272A', color: C.muted }}>Sans numéro</span>
      )}
    </div>
  );
};

const Delta = ({ value }: { value: number | null }) =>
  value === null ? (
    <span style={{ color: C.muted }}>—</span>
  ) : (
    <span style={{ color: value >= 0 ? C.green : C.red }}>{value > 0 ? '+' : ''}{value}%</span>
  );

const Spark = ({ series, color }: { series: number[]; color: string }) => (
  <div style={{ height: 52 }}>
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={series.map((v, i) => ({ i, v }))}>
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

const chartTooltip = {
  contentStyle: { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, color: '#fff' },
  itemStyle: { color: '#fff' },
  labelStyle: { color: C.muted },
  cursor: { fill: '#232323' },
};

/* ---------- Tableau des commandes à traiter ---------- */
function AttentionTable({ rows, q }: { rows: OrderDto[]; q: string }) {
  const list = rows.filter((o) => has(q, o.product?.title, o.seller?.name, o.seller?.shopName, o.buyer.name));
  if (!list.length) return <Empty text="Aucune commande à traiter pour le moment." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[760px]">
        <thead>
          <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }} className="text-left">
            <th className="px-5 py-3 font-medium">Photo produit</th>
            <th className="px-3 py-3 font-medium">Nom produit</th>
            <th className="px-3 py-3 font-medium">Vendeur</th>
            <th className="px-3 py-3 font-medium">Statut</th>
            <th className="px-5 py-3 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {list.map((o) => {
            const waiting = o.status === 'AWAITING_SELLER_CONFIRMATION';
            const label = waiting
              ? `En attente confirmation (${elapsed(o.createdAt)} écoulées)`
              : o.courier
              ? `Confirmée, vérification par ${o.courier.name}`
              : 'Confirmée, aucun livreur assigné';
            return (
              <tr key={o.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td className="px-5 py-3">
                  {safeUrl(o.product?.image) ? (
                    <img src={safeUrl(o.product?.image)!} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-12 w-12 rounded-md object-cover bg-white" />
                  ) : (
                    <div className="h-12 w-12 rounded-md" style={{ background: '#27272A' }} />
                  )}
                </td>
                <td className="px-3 py-3 font-medium text-white">
                  {o.product?.title ?? 'Produit indisponible'}
                  {o.itemsCount > 1 && <span style={{ color: C.muted }}> (+{o.itemsCount - 1})</span>}
                </td>
                <td className="px-3 py-3 text-white">{o.seller ? o.seller.shopName || o.seller.name : '—'}</td>
                <td className="px-3 py-3">
                  <span className="inline-block rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: waiting ? '#EA580C' : '#2563EB' }}>
                    {label}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <Contact phone={o.seller?.phone ?? null} userId={o.seller?.id} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Vues ---------- */
function DashboardView({ d, q }: { d: DashboardData; q: string }) {
  const cards = [
    { label: 'Commandes du jour', value: num(d.kpis.ordersToday), sub: null as string | null },
    { label: 'Produits en attente de vérification', value: num(d.kpis.ordersAwaitingVerification), sub: null },
    { label: 'Vendeurs actifs', value: num(d.kpis.activeSellers), sub: null },
    { label: "Chiffre d'affaires (livré)", value: usd(d.kpis.totalRevenueUSD), sub: cdf(d.kpis.totalRevenueCDF) },
  ];
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Panel key={c.label} className="p-5">
            <div className="text-sm" style={{ color: C.muted }}>{c.label}</div>
            <div className="mt-2 text-3xl font-bold text-white">{c.value}</div>
            {c.sub && <div className="mt-1 text-sm" style={{ color: C.muted }}>{c.sub}</div>}
          </Panel>
        ))}
      </div>
      <Panel className="mt-6 overflow-hidden">
        <div className="px-5 py-4 text-lg font-bold text-white" style={{ borderBottom: `1px solid ${C.border}` }}>
          Dernières commandes à vérifier
        </div>
        <AttentionTable rows={d.attentionOrders} q={q} />
      </Panel>
    </>
  );
}

function OrdersView({ d, q }: { d: DashboardData; q: string }) {
  const list = d.recentOrders.filter((o) => has(q, o.id, o.product?.title, o.buyer.name, o.seller?.name, o.seller?.shopName));
  return (
    <Panel className="overflow-hidden">
      <div className="px-5 py-4 text-lg font-bold text-white" style={{ borderBottom: `1px solid ${C.border}` }}>Dernières commandes</div>
      {!list.length ? (
        <Empty text="Aucune commande trouvée." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr style={{ color: C.muted, borderBottom: `1px solid ${C.border}` }} className="text-left">
                {['Réf.', 'Produit', 'Acheteur', 'Vendeur', 'Montant', 'Statut', 'Date'].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((o) => {
                const m = statusMeta(o.status);
                return (
                  <tr key={o.id} style={{ borderBottom: `1px solid ${C.border}` }} className="text-white">
                    <td className="px-4 py-3" style={{ color: C.muted }}>{o.id.slice(-8).toUpperCase()}</td>
                    <td className="px-4 py-3">{o.product?.title ?? '—'}{o.itemsCount > 1 && <span style={{ color: C.muted }}> (+{o.itemsCount - 1})</span>}</td>
                    <td className="px-4 py-3">{o.buyer.name}</td>
                    <td className="px-4 py-3">{o.seller ? o.seller.shopName || o.seller.name : '—'}</td>
                    <td className="px-4 py-3">{o.totalUSD > 0 ? usd(o.totalUSD) : cdf(o.totalCDF)}</td>
                    <td className="px-4 py-3"><span className="font-semibold" style={{ color: m.color }}>{m.label}</span></td>
                    <td className="px-4 py-3" style={{ color: C.muted }}>{shortDate(o.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function SellersView({ d, q }: { d: DashboardData; q: string }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'shops' | 'individuals'>('shops');
  const shops = d.shops.items.filter((s) => has(q, s.name, s.owner.name, s.description));
  const people = d.individualSellers.items.filter((u) => has(q, u.name, u.phone));

  const tabBtn = (id: 'shops' | 'individuals', label: string, count: number) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className="flex-1 rounded-xl px-5 py-4 text-left text-lg font-semibold text-white"
      style={{ background: C.panel, border: `2px solid ${tab === id ? C.orange : C.border}` }}
    >
      {label} <span style={{ color: C.muted }}>({num(count)})</span>
    </button>
  );
  const meta = (s: SellerStats) => (
    <>
      <span className="whitespace-nowrap text-white">
        {s.rating !== null ? `${s.rating.toFixed(1)}/5` : 'Pas de note'}
        <span style={{ color: C.muted }}> ({s.reviewsCount})</span>
      </span>
      <span className="whitespace-nowrap text-white">{num(s.availableProducts)} marchandises dispos.</span>
    </>
  );

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row">
        {tabBtn('shops', '1. Boutiques / Shops', d.shops.total)}
        {tabBtn('individuals', '2. Vendeurs particuliers', d.individualSellers.total)}
      </div>
      <Panel className="mt-4 overflow-hidden">
        {tab === 'shops' ? (
          !shops.length ? <Empty text="Aucune boutique trouvée." /> : shops.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
              <div className="flex items-center gap-3 w-64 min-w-0">
                <Avatar src={s.logo} name={s.name} size={36} />
                <div className="min-w-0">
                  <div className="truncate font-semibold text-white">{s.name}</div>
                  <div className="text-xs font-semibold" style={{ color: s.verified ? C.green : C.orange }}>{s.verified ? 'Vérifiée' : 'Non vérifiée'}</div>
                </div>
              </div>
              <div className="w-44 truncate text-white">{s.owner.name}</div>
              {meta(s)}
              <div className="min-w-0 flex-1 truncate" style={{ color: C.muted }}>{s.description || 'Aucune description.'}</div>
              <Contact phone={s.owner.phone} userId={s.owner.id} />
              <button type="button" onClick={() => navigate(`/users/${s.owner.id}`)} className="h-9 w-9 rounded-lg flex items-center justify-center text-white" style={{ background: '#27272A' }}>
                <Icon name="chevron" size={18} />
              </button>
            </div>
          ))
        ) : !people.length ? (
          <Empty text="Aucun vendeur particulier trouvé." />
        ) : (
          people.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
              <div className="flex items-center gap-3 w-64 min-w-0">
                <Avatar src={u.avatar} name={u.name} size={36} />
                <div className="truncate font-semibold text-white">{u.name}</div>
              </div>
              {meta(u)}
              <div className="min-w-0 flex-1 truncate" style={{ color: C.muted }}>Inscrit le {new Date(u.createdAt).toLocaleDateString('fr-FR')}</div>
              <Contact phone={u.phone} userId={u.id} />
              <button type="button" onClick={() => navigate(`/users/${u.id}`)} className="h-9 w-9 rounded-lg flex items-center justify-center text-white" style={{ background: '#27272A' }}>
                <Icon name="chevron" size={18} />
              </button>
            </div>
          ))
        )}
      </Panel>
    </>
  );
}

function CouriersView({ d, q }: { d: DashboardData; q: string }) {
  const rows = d.couriers.deliveries.filter((o) => has(q, o.courier?.name, o.product?.title, o.deliveryAddress));
  const stateOf = (o: OrderDto) =>
    o.status === 'SHIPPED'
      ? { text: 'En cours de livraison', color: C.green, action: 'À livrer' }
      : o.status === 'COURIER_VERIFIED'
      ? { text: 'Vérifié, prêt à expédier', color: '#14B8A6', action: 'À livrer' }
      : { text: 'Prêt pour ramassage', color: '#FACC15', action: 'À récupérer' };
  return (
    <Panel className="overflow-hidden">
      <div className="px-5 py-4 text-lg font-bold text-white" style={{ borderBottom: `1px solid ${C.border}` }}>
        Suivi des livraisons en direct <span className="text-sm font-normal" style={{ color: C.muted }}>({num(d.couriers.total)} livreurs)</span>
      </div>
      {!rows.length ? (
        <Empty text="Aucune livraison en cours." />
      ) : (
        rows.map((o) => {
          const s = stateOf(o);
          return (
            <div key={o.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-sm" style={{ borderBottom: `1px solid ${C.border}` }}>
              <div className="flex items-center gap-3 w-56 min-w-0">
                <Avatar src={o.courier?.avatar} name={o.courier?.name ?? '?'} size={40} />
                <div className="truncate font-semibold text-white">{o.courier?.name}</div>
              </div>
              <div className="min-w-0 flex-1 basis-64">
                <span className="font-semibold" style={{ color: s.color }}>{s.text}</span>
                <span className="text-white"> - {o.deliveryAddress || 'Adresse non renseignée'}</span>
              </div>
              <div className="min-w-0 basis-56 text-white">
                {o.product?.title ?? 'Produit'} - <span className="font-semibold" style={{ color: C.orange }}>{s.action}</span>
              </div>
              <Contact phone={o.courier?.phone ?? null} userId={o.courier?.id} />
            </div>
          );
        })
      )}
    </Panel>
  );
}

function StatsView({ d }: { d: DashboardData }) {
  const w = d.weekly;
  const kpis = [
    { label: 'Total commandes', metric: w.orders, fmt: num },
    { label: 'Nouveaux clients', metric: w.newClients, fmt: num },
    { label: "Chiffre d'affaires", metric: w.revenueUSD, fmt: usd },
  ];
  const statusData = w.statusDistribution.map((s) => ({ ...statusMeta(s.status), count: s.count }));
  const hours = w.peakHours.map((h) => ({ label: `${h.hour}h`, orders: h.orders }));
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        {kpis.map((k) => {
          const up = k.metric.deltaPct === null || k.metric.deltaPct >= 0;
          return (
            <Panel key={k.label} className="p-5">
              <div className="text-sm" style={{ color: C.muted }}>{k.label}</div>
              <div className="mt-1 flex items-baseline gap-3 text-2xl font-bold text-white">
                {k.fmt(k.metric.total)} <span className="text-base font-medium"><Delta value={k.metric.deltaPct} /></span>
              </div>
              <Spark series={k.metric.series} color={up ? C.green : C.red} />
            </Panel>
          );
        })}
      </div>

      <Panel className="mt-6 p-5">
        <div className="mb-3 text-lg font-semibold text-white">Répartition des commandes par statut (7 derniers jours)</div>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={statusData} margin={{ top: 24, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={C.border} />
              <XAxis dataKey="label" tick={{ fill: '#D4D4D8', fontSize: 12 }} axisLine={{ stroke: C.border }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: C.muted, fontSize: 12 }} axisLine={false} tickLine={false} width={36} />
              <Tooltip {...chartTooltip} />
              <Bar dataKey="count" name="Commandes" radius={[4, 4, 0, 0]} isAnimationActive={false} label={{ position: 'top', fill: '#fff', fontSize: 12 }}>
                {statusData.map((s) => <Cell key={s.label} fill={s.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel className="p-5">
          <div className="mb-3 text-lg font-semibold text-white">Catégories populaires</div>
          {!w.popularCategories.length ? <Empty text="Aucune vente cette semaine." /> : (
            <div className="flex items-center gap-4">
              <div style={{ width: 150, height: 150 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={w.popularCategories} dataKey="quantity" nameKey="name" innerRadius={42} outerRadius={70} stroke={C.panel} isAnimationActive={false}>
                      {w.popularCategories.map((c, i) => <Cell key={c.id} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip {...chartTooltip} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
                {w.popularCategories.map((c, i) => (
                  <li key={c.id} className="flex items-center gap-2 text-white">
                    <span className="h-3 w-3 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto" style={{ color: C.muted }}>{num(c.quantity)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel className="p-5">
          <div className="mb-3 text-lg font-semibold text-white">Top vendeurs</div>
          {!w.topSellers.length ? <Empty text="Aucune livraison cette semaine." /> : (
            <ul>
              {w.topSellers.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-white" style={{ borderBottom: `1px solid ${C.border}` }}>
                  <span className="truncate">{s.name}</span>
                  <span className="font-semibold">{num(s.orders)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="p-5">
          <div className="mb-3 text-lg font-semibold text-white">Heures de pointe</div>
          <div style={{ height: 170 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={hours} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={C.border} />
                <XAxis dataKey="label" interval={3} tick={{ fill: C.muted, fontSize: 11 }} axisLine={{ stroke: C.border }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: C.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip {...chartTooltip} />
                <Line type="monotone" dataKey="orders" name="Commandes" stroke="#3B82F6" strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </>
  );
}

/* ---------- Page ---------- */
export default function AdminSeller() {
  const { user, loading: authLoading } = useAuth();
  const allowed = !!user && ADMIN_ROLES.includes(user.role);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('dashboard');
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(ENDPOINT, { credentials: 'include', signal, headers: { Accept: 'application/json' } });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        const message =
          res.status === 401 ? 'Session expirée. Reconnectez-vous.'
          : res.status === 403 ? 'Accès refusé : réservé aux administrateurs.'
          : json?.message || 'Impossible de charger le tableau de bord.';
        if (res.status === 401 || res.status === 403) setData(null);
        setError({ status: res.status, message });
        return;
      }
      setData(json.data as DashboardData);
      setError(null);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      setError({ status: 0, message: 'Serveur injoignable. Vérifiez votre connexion.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Aucune requête n'est envoyée tant que la session n'est pas confirmée comme administrateur
    if (!allowed) return;
    const ctrl = new AbortController();
    load(ctrl.signal);
    const timer = window.setInterval(() => {
      if (document.hidden) return; // onglet en arrière-plan : on ne sollicite pas le serveur
      load();
    }, REFRESH_MS);
    return () => {
      ctrl.abort();
      window.clearInterval(timer);
    };
  }, [load, allowed]);

  const q = query.trim().toLowerCase();

  const nav = useMemo(
    () => [
      { id: 'dashboard' as View, label: 'Tableau de bord', icon: 'grid', badge: 0 },
      { id: 'orders' as View, label: 'Gestion des commandes', icon: 'orders', badge: data?.badges.ordersAwaitingSeller ?? 0 },
      { id: 'verifications' as View, label: 'Vérifications produits', icon: 'shield', badge: data?.kpis.ordersAwaitingVerification ?? 0 },
      { id: 'sellers' as View, label: 'Vendeurs (Shops vs Particuliers)', icon: 'users', badge: data?.badges.shopsUnverified ?? 0 },
      { id: 'couriers' as View, label: 'Parcours des livreurs', icon: 'route', badge: 0 },
      { id: 'stats' as View, label: 'Statistiques de la semaine', icon: 'chart', badge: 0 },
    ],
    [data],
  );
  const titles: Record<View, string> = {
    dashboard: 'Tableau de bord',
    orders: 'Gestion des commandes',
    verifications: 'Vérifications produits',
    sellers: 'Vendeurs',
    couriers: 'Parcours des livreurs',
    stats: 'Statistiques de la semaine',
  };
  const attention = (data?.badges.ordersAwaitingSeller ?? 0) + (data?.kpis.ordersAwaitingVerification ?? 0);

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm" style={{ background: C.page, color: C.muted }}>Vérification de la session...</div>;
  }
  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ background: C.page }}>
        <Panel className="max-w-md p-8 text-center">
          <p className="text-lg font-semibold text-white">Accès refusé</p>
          <p className="mt-2 text-sm" style={{ color: C.muted }}>Cette page est réservée aux administrateurs.</p>
        </Panel>
      </div>
    );
  }


  return (
    <div className="flex min-h-screen text-gray-100" style={{ background: C.page }}>
      {/* Barre latérale */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 shrink-0 transform transition-transform lg:static lg:translate-x-0 ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
        style={{ background: C.panel, borderRight: `1px solid ${C.border}` }}
      >
        <div className="px-6 py-6 text-3xl font-extrabold tracking-tight">
          <span style={{ color: C.green }}>CBF</span>
          <span style={{ color: C.orange }}>SOKO</span>
        </div>
        <nav className="px-3 space-y-1">
          {nav.map((n) => {
            const active = view === n.id;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => { setView(n.id); setMenuOpen(false); }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-[15px]"
                style={{ background: active ? '#262626' : 'transparent', color: active ? '#fff' : '#D4D4D8', borderLeft: `4px solid ${active ? C.green : 'transparent'}` }}
              >
                <Icon name={n.icon} />
                <span className="flex-1">{n.label}</span>
                {n.badge > 0 && (
                  <span className="min-w-[22px] rounded-full px-1.5 py-0.5 text-center text-xs font-bold text-white" style={{ background: n.id === 'sellers' ? C.orange : C.red }}>
                    {n.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* En-tête */}
        <header className="flex items-center gap-3 px-4 py-3 lg:px-6" style={{ background: C.panel, borderBottom: `1px solid ${C.border}` }}>
          <button type="button" className="lg:hidden text-white" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">
            <Icon name="menu" size={24} />
          </button>
          <div className="flex h-11 flex-1 max-w-xl items-center gap-2 rounded-lg px-3" style={{ background: '#222222', border: `1px solid ${C.border}` }}>
            <span style={{ color: C.muted }}><Icon name="search" size={18} /></span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher"
              className="w-full bg-transparent text-sm text-white outline-none placeholder-gray-500"
            />
          </div>
          <div className="ml-auto flex items-center gap-4">
            <button type="button" onClick={() => load()} title="Actualiser" className="text-gray-300"><Icon name="refresh" size={20} /></button>
            <div className="relative text-gray-300">
              <Icon name="bell" size={22} />
              {attention > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full" style={{ background: C.red }} />}
            </div>
            <div className="flex items-center gap-2">
              <Avatar name={data?.viewer.name ?? '?'} size={36} />
              <span className="hidden text-sm sm:block">{data?.viewer.name ?? ''}</span>
            </div>
          </div>
        </header>

        {/* Contenu */}
        <main className="flex-1 p-4 lg:p-6">
          <div className="mb-5 flex items-center gap-3 rounded-xl px-5 py-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
            <span style={{ color: C.muted }}><Icon name={nav.find((n) => n.id === view)!.icon} size={26} /></span>
            <h1 className="text-xl font-semibold text-white">{titles[view]}</h1>
            {data && <span className="ml-auto text-xs" style={{ color: C.muted }}>Mis à jour à {new Date(data.generatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>

          {loading && !data ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy="true">
              {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl" style={{ background: C.panel, border: `1px solid ${C.border}` }} />)}
              <p className="col-span-full text-sm" style={{ color: C.muted }}>Chargement des données...</p>
            </div>
          ) : error && !data ? (
            <Panel className="p-8 text-center">
              <p className="text-white">{error.message}</p>
              {error.status !== 403 && error.status !== 401 && (
                <button type="button" onClick={() => { setLoading(true); load(); }} className="mt-4 rounded-lg px-5 py-2 text-sm font-semibold text-white" style={{ background: C.orange }}>
                  Réessayer
                </button>
              )}
            </Panel>
          ) : data ? (
            <>
              {error && <div className="mb-4 rounded-lg px-4 py-2 text-sm text-white" style={{ background: '#7F1D1D' }}>{error.message} Les données affichées peuvent être obsolètes.</div>}
              {view === 'dashboard' && <DashboardView d={data} q={q} />}
              {view === 'orders' && <OrdersView d={data} q={q} />}
              {view === 'verifications' && (
                <Panel className="overflow-hidden">
                  <AttentionTable rows={data.attentionOrders.filter((o) => o.status === 'CONFIRMED')} q={q} />
                </Panel>
              )}
              {view === 'sellers' && <SellersView d={data} q={q} />}
              {view === 'couriers' && <CouriersView d={data} q={q} />}
              {view === 'stats' && <StatsView d={data} />}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}