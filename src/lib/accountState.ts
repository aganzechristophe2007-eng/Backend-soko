import { z } from 'zod';
import prisma from './prisma';

// ==========================================
// ÉTAT DU COMPTE + PRÉFÉRENCES UTILISATEUR
// accountStatus : ACTIVE | PAUSED | PENDING_DELETION | DELETED
// ==========================================

export type AccountStatus = 'ACTIVE' | 'PAUSED' | 'PENDING_DELETION' | 'DELETED';

export interface NotifPrefs {
  orders: boolean;
  messages: boolean;
  products: boolean;
  shops: boolean;
  payments: boolean;
}

export interface Preferences {
  privacy: {
    profileVisibility: 'everyone' | 'members';
    allowMessagesFromStrangers: boolean;
  };
  notifications: NotifPrefs;
  shop: { vacationMode: boolean; vacationNote: string };
  delivery: {
    recipientName: string;
    phone: string;
    city: string;
    commune: string;
    quarter: string;
    address: string;
    landmark: string;
  };
}

export const DEFAULT_PREFERENCES: Preferences = {
  privacy: { profileVisibility: 'everyone', allowMessagesFromStrangers: true },
  notifications: { orders: true, messages: true, products: true, shops: true, payments: true },
  shop: { vacationMode: false, vacationNote: '' },
  delivery: { recipientName: '', phone: '', city: '', commune: '', quarter: '', address: '', landmark: '' },
};

// Schéma strict du PATCH : seuls les champs connus passent, avec des longueurs bornées.
const short = (max: number) => z.string().trim().max(max);
export const preferencesPatchSchema = z
  .object({
    privacy: z
      .object({
        profileVisibility: z.enum(['everyone', 'members']),
        allowMessagesFromStrangers: z.boolean(),
      })
      .partial()
      .strict(),
    notifications: z
      .object({
        orders: z.boolean(),
        messages: z.boolean(),
        products: z.boolean(),
        shops: z.boolean(),
        payments: z.boolean(),
      })
      .partial()
      .strict(),
    shop: z.object({ vacationMode: z.boolean(), vacationNote: short(200) }).partial().strict(),
    delivery: z
      .object({
        recipientName: short(80),
        phone: short(20),
        city: short(60),
        commune: short(60),
        quarter: short(60),
        address: short(200),
        landmark: short(120),
      })
      .partial()
      .strict(),
  })
  .partial()
  .strict();

export type PreferencesPatch = z.infer<typeof preferencesPatchSchema>;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Fusionne des préférences stockées (non fiables) avec les valeurs par défaut : types vérifiés champ par champ. */
export function mergePreferences(stored: unknown): Preferences {
  const out: Preferences = JSON.parse(JSON.stringify(DEFAULT_PREFERENCES));
  if (!isRecord(stored)) return out;

  const pick = (target: Record<string, unknown>, source: unknown) => {
    if (!isRecord(source)) return;
    for (const key of Object.keys(target)) {
      const value = source[key];
      if (typeof value === typeof target[key]) target[key] = value;
    }
  };
  pick(out.privacy as unknown as Record<string, unknown>, stored.privacy);
  if (out.privacy.profileVisibility !== 'everyone' && out.privacy.profileVisibility !== 'members') {
    out.privacy.profileVisibility = 'everyone';
  }
  pick(out.notifications as unknown as Record<string, unknown>, stored.notifications);
  pick(out.shop as unknown as Record<string, unknown>, stored.shop);
  pick(out.delivery as unknown as Record<string, unknown>, stored.delivery);
  return out;
}

export function applyPatch(current: Preferences, patch: PreferencesPatch): Preferences {
  return {
    privacy: { ...current.privacy, ...(patch.privacy ?? {}) },
    notifications: { ...current.notifications, ...(patch.notifications ?? {}) },
    shop: { ...current.shop, ...(patch.shop ?? {}) },
    delivery: { ...current.delivery, ...(patch.delivery ?? {}) },
  };
}

export async function getPreferences(userId: string): Promise<Preferences> {
  const row = await prisma.userPreferences.findUnique({ where: { userId } });
  return mergePreferences(row?.data);
}

export async function getPreferencesMany(userIds: string[]): Promise<Map<string, Preferences>> {
  const map = new Map<string, Preferences>();
  if (userIds.length === 0) return map;
  const rows = await prisma.userPreferences.findMany({ where: { userId: { in: userIds } } });
  for (const row of rows) map.set(row.userId, mergePreferences(row.data));
  return map;
}

// ---------- Statut du compte (petit cache mémoire : évite une requête SQL de plus à chaque appel) ----------
const STATUS_TTL_MS = 15_000;
const statusCache = new Map<string, { status: AccountStatus | null; exp: number }>();

/** null = utilisateur introuvable. */
export async function getAccountStatus(userId: string): Promise<AccountStatus | null> {
  const hit = statusCache.get(userId);
  if (hit && hit.exp > Date.now()) return hit.status;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { accountStatus: true } });
  const status = user ? ((user.accountStatus as AccountStatus) ?? 'ACTIVE') : null;
  statusCache.set(userId, { status, exp: Date.now() + STATUS_TTL_MS });
  if (statusCache.size > 5000) statusCache.clear();
  return status;
}

export function invalidateAccountStatus(userId: string) {
  statusCache.delete(userId);
}

// Un compte en pause (ou en cours de suppression) ne peut plus rien faire, sauf gérer son compte.
const ALLOWED_WHILE_RESTRICTED = ['/api/settings/account', '/api/settings/preferences', '/api/auth'];

export function isAllowedWhileRestricted(originalUrl: string): boolean {
  const path = originalUrl.split('?')[0];
  return ALLOWED_WHILE_RESTRICTED.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export const RESTRICTED_MESSAGE: Record<'PAUSED' | 'PENDING_DELETION', string> = {
  PAUSED: 'Votre compte est en pause. Réactivez-le dans Paramètres pour continuer.',
  PENDING_DELETION: 'La suppression de votre compte est programmée. Annulez-la dans Paramètres pour continuer.',
};

// ---------- Blocages ----------
export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const found = await prisma.blockedUser.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { id: true },
  });
  return !!found;
}
