import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { applyPatch, getPreferences, invalidateAccountStatus, preferencesPatchSchema } from '../lib/accountState';

// ==========================================
// PARAMÈTRES — préférences, compte (pause / suppression), utilisateurs bloqués
//  GET    /api/settings/preferences        : préférences + état du compte
//  PATCH  /api/settings/preferences        : modifie une ou plusieurs sections (confidentialité, notifications, boutique, livraison)
//  POST   /api/settings/account/pause      : met le compte en pause (mot de passe exigé)
//  POST   /api/settings/account/reactivate : réactive un compte en pause OU annule une suppression programmée
//  POST   /api/settings/account/delete-request : programme la suppression dans 30 jours (mot de passe exigé)
//  GET    /api/settings/blocks             : liste des utilisateurs bloqués
//  POST   /api/settings/blocks             : bloque un utilisateur
//  DELETE /api/settings/blocks/:userId     : débloque
// Les routes /account/* et /preferences restent accessibles à un compte en pause (voir accountState.ts).
// ==========================================

const router = Router();

export const DELETION_GRACE_DAYS = 30;
const DAY_MS = 86_400_000;

const userKey = (req: unknown): string => (req as AuthRequest).user?.id ?? 'anonyme';

const prefsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKey,
  message: { success: false, error: 'Trop de modifications. Réessayez dans quelques minutes.' },
});

// Actions sensibles protégées par mot de passe : très peu de tentatives.
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userKey,
  message: { success: false, error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
});

const fail = (res: Response, status: number, error: string) => res.status(status).json({ success: false, error, message: error });

const accountPayload = (u: { accountStatus?: string | null; pausedAt?: Date | null; deletionScheduledAt?: Date | null }) => ({
  status: u.accountStatus ?? 'ACTIVE',
  pausedAt: u.pausedAt ?? null,
  deletionScheduledAt: u.deletionScheduledAt ?? null,
  daysLeft: u.deletionScheduledAt ? Math.max(0, Math.ceil((u.deletionScheduledAt.getTime() - Date.now()) / DAY_MS)) : null,
});

async function checkPassword(userId: string, password: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!user) return false;
  return bcrypt.compare(password, user.password);
}

router.use('/preferences', requireAuth);
router.use('/account', requireAuth);
router.use('/blocks', requireAuth);

// ---------- Préférences ----------
router.get('/preferences', prefsLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const [data, user] = await Promise.all([
      getPreferences(userId),
      prisma.user.findUnique({ where: { id: userId }, select: { accountStatus: true, pausedAt: true, deletionScheduledAt: true } }),
    ]);
    return res.json({ success: true, data, account: accountPayload(user ?? {}) });
  } catch (err: unknown) {
    console.error('Erreur GET /settings/preferences :', err instanceof Error ? err.message : err);
    return fail(res, 500, 'Erreur serveur lors du chargement des paramètres.');
  }
});

router.patch('/preferences', prefsLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const parsed = preferencesPatchSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? 'Paramètres invalides.');

    const current = await getPreferences(userId);
    const next = applyPatch(current, parsed.data);
    await prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, data: next as unknown as object },
      update: { data: next as unknown as object },
    });
    return res.json({ success: true, data: next });
  } catch (err: unknown) {
    console.error('Erreur PATCH /settings/preferences :', err instanceof Error ? err.message : err);
    return fail(res, 500, "Erreur serveur lors de l'enregistrement des paramètres.");
  }
});

// ---------- Pause du compte ----------
const passwordOnly = z.object({ password: z.string().min(1, 'Mot de passe requis.').max(200) });

router.post('/account/pause', sensitiveLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const parsed = passwordOnly.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? 'Données invalides.');
    if (!(await checkPassword(userId, parsed.data.password))) return fail(res, 400, 'Mot de passe incorrect.');

    const current = await prisma.user.findUnique({ where: { id: userId }, select: { accountStatus: true } });
    if ((current?.accountStatus ?? 'ACTIVE') !== 'ACTIVE') return fail(res, 409, "Ce compte n'est pas actif.");

    const user = await prisma.user.update({
      where: { id: userId },
      data: { accountStatus: 'PAUSED', pausedAt: new Date() },
      select: { accountStatus: true, pausedAt: true, deletionScheduledAt: true },
    });
    invalidateAccountStatus(userId);
    return res.json({ success: true, account: accountPayload(user) });
  } catch (err: unknown) {
    console.error('Erreur POST /settings/account/pause :', err instanceof Error ? err.message : err);
    return fail(res, 500, 'Erreur serveur lors de la mise en pause.');
  }
});

// ---------- Réactivation (pause) / annulation (suppression programmée) ----------
router.post('/account/reactivate', prefsLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const current = await prisma.user.findUnique({ where: { id: userId }, select: { accountStatus: true } });
    const status = current?.accountStatus ?? 'ACTIVE';
    if (status !== 'PAUSED' && status !== 'PENDING_DELETION') return fail(res, 409, 'Ce compte est déjà actif.');

    const user = await prisma.user.update({
      where: { id: userId },
      data: { accountStatus: 'ACTIVE', pausedAt: null, deletionScheduledAt: null },
      select: { accountStatus: true, pausedAt: true, deletionScheduledAt: true },
    });
    invalidateAccountStatus(userId);
    return res.json({ success: true, account: accountPayload(user) });
  } catch (err: unknown) {
    console.error('Erreur POST /settings/account/reactivate :', err instanceof Error ? err.message : err);
    return fail(res, 500, 'Erreur serveur lors de la réactivation.');
  }
});

// ---------- Suppression avec délai de grâce ----------
const deleteSchema = z.object({
  password: z.string().min(1, 'Mot de passe requis.').max(200),
  confirm: z.literal('SUPPRIMER', { errorMap: () => ({ message: 'Tapez SUPPRIMER pour confirmer.' }) }),
});

router.post('/account/delete-request', sensitiveLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const parsed = deleteSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, parsed.error.issues[0]?.message ?? 'Données invalides.');
    if (!(await checkPassword(userId, parsed.data.password))) return fail(res, 400, 'Mot de passe incorrect.');

    const current = await prisma.user.findUnique({ where: { id: userId }, select: { accountStatus: true } });
    const status = current?.accountStatus ?? 'ACTIVE';
    if (status === 'PENDING_DELETION') return fail(res, 409, 'La suppression est déjà programmée.');
    if (status !== 'ACTIVE' && status !== 'PAUSED') return fail(res, 409, "Ce compte n'est pas actif.");

    // Jamais de suppression qui laisserait un acheteur ou un vendeur sans réponse, ni de l'argent bloqué.
    const activeOrders = await prisma.order.count({
      where: { OR: [{ buyerId: userId }, { sellerId: userId }], status: { notIn: ['DELIVERED', 'CANCELLED', 'EXPIRED'] } },
    });
    if (activeOrders > 0) {
      return fail(res, 409, 'Vous avez des commandes en cours. Terminez-les ou attendez leur clôture avant de supprimer le compte.');
    }
    const wallet = await prisma.wallet.findUnique({ where: { userId }, select: { balanceCDF: true, balanceUSD: true } });
    if (wallet && (wallet.balanceCDF > 0 || wallet.balanceUSD > 0)) {
      return fail(res, 409, 'Votre portefeuille contient encore de l’argent. Retirez-le avant de supprimer le compte.');
    }

    const scheduled = new Date(Date.now() + DELETION_GRACE_DAYS * DAY_MS);
    const user = await prisma.user.update({
      where: { id: userId },
      data: { accountStatus: 'PENDING_DELETION', pausedAt: new Date(), deletionScheduledAt: scheduled },
      select: { accountStatus: true, pausedAt: true, deletionScheduledAt: true },
    });
    invalidateAccountStatus(userId);
    return res.json({ success: true, account: accountPayload(user) });
  } catch (err: unknown) {
    console.error('Erreur POST /settings/account/delete-request :', err instanceof Error ? err.message : err);
    return fail(res, 500, 'Erreur serveur lors de la demande de suppression.');
  }
});

// ---------- Utilisateurs bloqués ----------
router.get('/blocks', prefsLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const rows = await prisma.blockedUser.findMany({
      where: { blockerId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const users = rows.length
      ? await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.blockedId) } }, select: { id: true, name: true, avatar: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    const data = rows
      .map((r) => {
        const u = byId.get(r.blockedId);
        return u ? { id: u.id, name: u.name, avatar: u.avatar, blockedAt: r.createdAt } : null;
      })
      .filter(Boolean);
    return res.json({ success: true, data });
  } catch (err: unknown) {
    console.error('Erreur GET /settings/blocks :', err instanceof Error ? err.message : err);
    return fail(res, 500, 'Erreur serveur lors du chargement des utilisateurs bloqués.');
  }
});

const blockSchema = z.object({ userId: z.string().min(1).max(100) });

router.post('/blocks', prefsLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const me = req.user!.id;
    const parsed = blockSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, 'Utilisateur invalide.');
    const target = parsed.data.userId;
    if (target === me) return fail(res, 400, 'Vous ne pouvez pas vous bloquer vous-même.');

    const exists = await prisma.user.findUnique({ where: { id: target }, select: { id: true } });
    if (!exists) return fail(res, 404, 'Utilisateur introuvable.');

    try {
      await prisma.blockedUser.create({ data: { blockerId: me, blockedId: target } });
    } catch (e: any) {
      if (e?.code !== 'P2002') throw e; // déjà bloqué : rien à faire
    }
    return res.status(201).json({ success: true });
  } catch (err: unknown) {
    console.error('Erreur POST /settings/blocks :', err instanceof Error ? err.message : err);
    return fail(res, 500, 'Erreur serveur lors du blocage.');
  }
});

router.delete('/blocks/:userId', prefsLimiter, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.blockedUser.deleteMany({ where: { blockerId: req.user!.id, blockedId: String(req.params.userId) } });
    return res.json({ success: true });
  } catch (err: unknown) {
    console.error('Erreur DELETE /settings/blocks/:userId :', err instanceof Error ? err.message : err);
    return fail(res, 500, 'Erreur serveur lors du déblocage.');
  }
});

export default router;
