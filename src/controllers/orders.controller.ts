import { Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { MESSAGE_INCLUDE, deliverMessage } from './messages.controller';
import { notifier } from '../services/notifier';
import { applyPatch, getAccountStatus, getPreferences, isBlockedEitherWay } from '../lib/accountState';

const DELIVERY_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 heures max laissées au vendeur pour confirmer
const SIMILAR_PRODUCTS_LIMIT = 6;

// Commission de la plateforme sur le prix du produit (hors livraison).
export const PLATFORM_COMMISSION_RATE = 0.005; // 0,5 % partout (décision du 24/10/2026, auparavant 3 %)

// Frais de livraison : forfait unique de 2 000 CDF pour l'instant (décision du 24/10/2026).
// Le retrait chez le vendeur est gratuit. Plus tard, le tarif pourra dépendre du lieu :
// il suffira de modifier cette fonction (tous les calculs de paiement passent par elle).
export const DELIVERY_FEE_FLAT_CDF = 2000;

export function calculateDeliveryFeeCDF(
  _unitWeightKg?: number | null,
  _quantity?: number,
  fulfillment: 'DELIVERY' | 'PICKUP' = 'DELIVERY'
): number {
  return fulfillment === 'PICKUP' ? 0 : DELIVERY_FEE_FLAT_CDF;
}

/** Mode de réception enregistré pour une commande (livraison par défaut si aucune fiche n'existe). */
export async function getOrderFulfillment(orderId: string): Promise<'DELIVERY' | 'PICKUP'> {
  const row = await prisma.orderDelivery.findUnique({ where: { orderId }, select: { fulfillment: true } });
  return row?.fulfillment === 'PICKUP' ? 'PICKUP' : 'DELIVERY';
}

// Convertit un montant CDF en USD en réutilisant le taux réel de CETTE commande
// (order.totalCDF / order.totalUSD), pour rester cohérent avec le prix affiché au client
// plutôt que d'appliquer un taux global qui pourrait diverger.
export function cdfToUsd(amountCDF: number, order: { totalUSD: number; totalCDF: number }): number {
  const rate = order.totalUSD > 0 && order.totalCDF > 0 ? order.totalCDF / order.totalUSD : 2300;
  return Math.round((amountCDF / rate) * 100) / 100;
}

// Revérifie toujours le rôle en base (jamais fait confiance à un éventuel claim de rôle
// présent dans le JWT, qui peut être obsolète si le rôle a changé depuis l'émission du token).
async function getUserRole(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role ?? null;
}
async function isAdmin(userId: string): Promise<boolean> {
  const role = await getUserRole(userId);
  return !!role && ['ADMIN', 'SUPER_ADMIN'].includes(role);
}

const text = (max: number) => z.string().trim().max(max);

// Fenêtre « Me faire livrer » : toutes les données nécessaires à une livraison réussie, validées côté serveur.
const deliveryRequestSchema = z
  .object({
    productId: z.string().min(1, 'productId requis'),
    quantity: z.coerce.number().int('Quantité invalide').min(1, 'Quantité invalide').max(999, 'Quantité invalide').default(1),
    fulfillment: z.enum(['DELIVERY', 'PICKUP']).default('DELIVERY'),
    paymentMethod: z.enum(['WALLET', 'MOBILE_MONEY']).default('MOBILE_MONEY'),
    recipientName: text(80).min(2, 'Indiquez le nom de la personne qui recevra la commande.'),
    phone: z.string().trim().regex(/^\+?[0-9 ()-]{6,20}$/, 'Numéro de téléphone invalide.'),
    city: text(60).default(''),
    commune: text(60).default(''),
    quarter: text(60).default(''),
    address: text(200).default(''),
    landmark: text(120).optional(),
    note: text(300).optional(),
    saveAsDefault: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.fulfillment !== 'DELIVERY') return;
    const required: [keyof typeof value, string][] = [
      ['city', 'Indiquez la ville.'],
      ['commune', 'Indiquez la commune.'],
      ['quarter', 'Indiquez le quartier.'],
      ['address', "Indiquez l'adresse précise (avenue, numéro)."],
    ];
    for (const [field, message] of required) {
      if (String(value[field] ?? '').length < 2) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    }
  });

type DeliveryRow = {
  orderId: string;
  recipientName: string;
  phone: string;
  city: string;
  commune: string;
  quarter: string;
  address: string;
  landmark: string | null;
  fulfillment: string;
  paymentMethod: string;
  note: string | null;
};

async function loadDeliveries(orderIds: string[]): Promise<Map<string, DeliveryRow>> {
  if (orderIds.length === 0) return new Map();
  const rows = await prisma.orderDelivery.findMany({ where: { orderId: { in: orderIds } } });
  return new Map(rows.map((r) => [r.orderId, r as DeliveryRow]));
}

// Texte unique affiché au livreur (sa file d'attente affiche déjà `deliveryAddress`).
function formatDeliveryAddress(d: DeliveryRow): string {
  if (d.fulfillment === 'PICKUP') return `${d.recipientName} · ${d.phone} · Retrait chez le vendeur`;
  const place = [d.address, d.quarter, d.commune, d.city].filter(Boolean).join(', ');
  return `${d.recipientName} · ${d.phone} · ${place}${d.landmark ? ` (repère : ${d.landmark})` : ''}`;
}

// Corps envoyé par l'app livreur lors du passage "Vérifié par CBFSOKO".
const courierVerifySchema = z.object({
  verificationNote: z.string().max(500).optional(),
  verificationPhotos: z.array(z.string().min(1)).max(8).optional(),
});

// Corps envoyé par l'admin pour assigner un livreur à une commande confirmée.
const assignCourierSchema = z.object({
  courierId: z.string().min(1, 'courierId requis'),
});

// Ce que le front (Orders.tsx) affiche pour une commande : produit, vendeur, prix, statut, chrono.
const ORDER_INCLUDE = {
  items: {
    include: {
      product: {
        select: {
          id: true,
          title: true,
          images: true,
          priceUSD: true,
          priceCDF: true,
          categoryId: true,
          isSold: true,
          weight: true,
          seller: { select: { id: true, name: true, avatar: true } },
        },
      },
    },
  },
  review: { select: { rating: true, comment: true } },
  courier: { select: { id: true, name: true, avatar: true } },
} as const;

// Ce que la file d'attente du livreur (CourierQueue.tsx) a besoin de voir en plus :
// coordonnées de l'acheteur, pour organiser la collecte/livraison.
const COURIER_ORDER_INCLUDE = {
  ...ORDER_INCLUDE,
  buyer: { select: { id: true, name: true, avatar: true } },
} as const;

async function findSimilarProducts(categoryId: string, excludeProductId: string) {
  return prisma.product.findMany({
    where: { categoryId, id: { not: excludeProductId }, isSold: false },
    select: { id: true, title: true, images: true, priceUSD: true, priceCDF: true, location: true },
    orderBy: { createdAt: 'desc' },
    take: SIMILAR_PRODUCTS_LIMIT,
  });
}

// Bascule une commande en attente dont le délai est dépassé vers EXPIRED, prévient l'acheteur
// (notification) et ne fait rien si elle n'est pas concernée. Appelée à la lecture (lazy) ET
// par le balayage périodique dans server.ts — Render (gratuit) peut mettre le service en veille,
// donc on ne compte pas uniquement sur le minuteur en mémoire.
async function expireIfNeeded(order: {
  id: string;
  status: string;
  expiresAt: Date | null;
  buyerId: string;
  items: { product: { id: string; title: string; categoryId: string } }[];
}) {
  if (order.status !== 'AWAITING_SELLER_CONFIRMATION' || !order.expiresAt || order.expiresAt > new Date()) {
    return false;
  }

  await prisma.order.update({ where: { id: order.id }, data: { status: 'EXPIRED' } });

  const product = order.items[0]?.product;
  await notifier.create({
    userId: order.buyerId,
    type: 'ORDER',
    title: 'Produit indisponible',
    message: product
      ? `"${product.title}" n'est plus disponible. Découvrez des produits similaires.`
      : "Ce produit n'est plus disponible.",
    link: '/orders',
    dedupeKey: `order:${order.id}:EXPIRED:buyer`,
  });

  return true;
}

// Appelée toutes les quelques minutes depuis server.ts : rattrape les expirations
// même si personne n'a rouvert l'app entre-temps.
export async function sweepExpiredOrders() {
  const candidates = await prisma.order.findMany({
    where: { status: 'AWAITING_SELLER_CONFIRMATION', expiresAt: { lte: new Date() } },
    include: { items: { include: { product: { select: { id: true, title: true, categoryId: true } } } } },
  });

  for (const order of candidates) {
    await expireIfNeeded(order as any);
  }
}

// POST /api/orders/delivery-request
// Déclenchée par le bouton "Me faire livrer" d'un reel.
export async function createDeliveryRequest(req: AuthRequest, res: Response) {
  try {
    const buyerId = req.user!.id;
    const parsed = deliveryRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Requête invalide' });
    }
    const input = parsed.data;

    const product = await prisma.product.findUnique({
      where: { id: input.productId },
      select: { id: true, title: true, priceUSD: true, priceCDF: true, sellerId: true, isSold: true, categoryId: true, quantity: true },
    });
    if (!product) return res.status(404).json({ success: false, message: 'Produit introuvable' });
    if (product.sellerId === buyerId) {
      return res.status(400).json({ success: false, message: 'Vous ne pouvez pas commander votre propre produit' });
    }
    if (product.isSold) {
      return res.status(409).json({ success: false, message: 'Ce produit est déjà vendu' });
    }

    // Vendeur dont le compte est en pause / supprimé : le produit est masqué, donc introuvable.
    if ((await getAccountStatus(product.sellerId)) !== 'ACTIVE') {
      return res.status(404).json({ success: false, message: 'Produit introuvable' });
    }
    if (await isBlockedEitherWay(buyerId, product.sellerId)) {
      return res.status(403).json({ success: false, message: 'Vous ne pouvez pas commander auprès de ce vendeur.' });
    }
    const sellerPrefs = await getPreferences(product.sellerId);
    if (sellerPrefs.shop.vacationMode) {
      const note = sellerPrefs.shop.vacationNote ? ` ${sellerPrefs.shop.vacationNote}` : '';
      return res.status(409).json({ success: false, message: `Ce vendeur est en vacances pour le moment.${note}` });
    }
    if (typeof product.quantity === 'number' && input.quantity > product.quantity) {
      return res.status(409).json({ success: false, message: `Quantité indisponible : il en reste ${product.quantity}.` });
    }

    // Anti-spam : une seule demande active à la fois pour ce produit par cet acheteur.
    const existingActive = await prisma.order.findFirst({
      where: {
        buyerId,
        status: 'AWAITING_SELLER_CONFIRMATION',
        items: { some: { productId: product.id } },
      },
      include: ORDER_INCLUDE,
    });
    if (existingActive) {
      return res.status(200).json({ success: true, order: existingActive, alreadyRequested: true, sellerId: product.sellerId });
    }

    const expiresAt = new Date(Date.now() + DELIVERY_TIMEOUT_MS);
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const totalUSD = round2(product.priceUSD * input.quantity);
    const totalCDF = Math.round(product.priceCDF * input.quantity);

    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          buyerId,
          sellerId: product.sellerId,
          totalUSD,
          totalCDF,
          status: 'AWAITING_SELLER_CONFIRMATION',
          expiresAt,
          items: {
            create: [{ productId: product.id, quantity: input.quantity, priceUSD: product.priceUSD, priceCDF: product.priceCDF }],
          },
        },
        include: ORDER_INCLUDE,
      });
      await tx.orderDelivery.create({
        data: {
          orderId: created.id,
          recipientName: input.recipientName,
          phone: input.phone,
          city: input.city,
          commune: input.commune,
          quarter: input.quarter,
          address: input.address,
          landmark: input.landmark || null,
          fulfillment: input.fulfillment,
          paymentMethod: input.paymentMethod,
          note: input.note || null,
        },
      });
      return created;
    });

    // « Enregistrer pour la prochaine fois » : mémorise l'adresse dans les préférences de l'acheteur.
    if (input.saveAsDefault && input.fulfillment === 'DELIVERY') {
      try {
        const current = await getPreferences(buyerId);
        const next = applyPatch(current, {
          delivery: {
            recipientName: input.recipientName,
            phone: input.phone,
            city: input.city,
            commune: input.commune,
            quarter: input.quarter,
            address: input.address,
            landmark: input.landmark ?? '',
          },
        });
        await prisma.userPreferences.upsert({
          where: { userId: buyerId },
          create: { userId: buyerId, data: next as unknown as object },
          update: { data: next as unknown as object },
        });
      } catch (e) {
        console.error('Erreur enregistrement adresse par défaut:', e);
      }
    }

    // Message automatique au vendeur, dans la vraie messagerie (donc visible dans Messages.tsx),
    // avec orderId pour que le front affiche les boutons Confirmer / Indisponible.
    // Le vendeur ne reçoit PAS le téléphone ni l'adresse exacte : ils vont au livreur CBFSOKO.
    const where = input.fulfillment === 'PICKUP' ? 'Retrait chez le vendeur.' : `Livraison : ${input.quarter}, ${input.commune}, ${input.city}.`;
    const message = await prisma.message.create({
      data: {
        senderId: buyerId,
        receiverId: product.sellerId,
        type: 'ORDER_REQUEST',
        content: `Nouvelle commande : ${input.quantity} × « ${product.title} ». ${where} Confirmez-vous que ce produit est toujours disponible ?`,
        orderId: order.id,
      },
      include: MESSAGE_INCLUDE,
    });
    await deliverMessage(message as any);

    // Notification immédiate du vendeur, cliquable vers la conversation de l'acheteur.
    // Même clé que le balayage périodique : aucun doublon.
    await notifier.create({
      userId: product.sellerId,
      type: 'ORDER',
      title: 'Nouvelle commande',
      message: `${req.user?.name || 'Un acheteur'} souhaite commander ${input.quantity} × « ${product.title.slice(0, 60)} ». Confirmez la disponibilité rapidement.`,
      link: `/messages?with=${encodeURIComponent(buyerId)}`,
      dedupeKey: `order:${order.id}:AWAITING_SELLER_CONFIRMATION:seller`,
      actorId: buyerId,
    });

    return res.status(201).json({ success: true, order, sellerId: product.sellerId });
  } catch (err) {
    console.error('Erreur createDeliveryRequest:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}

// GET /api/orders/mine — alimente Orders.tsx
export async function getMyOrders(req: AuthRequest, res: Response) {
  try {
    const buyerId = req.user!.id;

    const orders = await prisma.order.findMany({
      where: { buyerId },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    const deliveries = await loadDeliveries(orders.map((o) => o.id));
    const result = [];
    for (const order of orders) {
      const justExpired = await expireIfNeeded(order as any);
      const status = justExpired ? 'EXPIRED' : order.status;
      const product = order.items[0]?.product;

      let similarProducts: Awaited<ReturnType<typeof findSimilarProducts>> = [];
      if (status === 'EXPIRED' && product) {
        similarProducts = await findSimilarProducts(product.categoryId, product.id);
      }

      result.push({ ...order, status, similarProducts, delivery: deliveries.get(order.id) ?? null });
    }

    return res.json({ success: true, data: result });
  } catch (err) {
    console.error('Erreur getMyOrders:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}

// GET /api/orders/:id/payment-summary — alimente PayPage.tsx
// Sécurité : réservé au buyer de cette commande, et seulement une fois que le livreur
// CBFSOKO a physiquement vérifié l'article (status COURIER_VERIFIED). Le paiement n'est
// PAS débloqué dès la simple confirmation du vendeur (CONFIRMED) : c'est précisément le
// contrôle qualité terrain qui doit précéder tout débit, conformément au pilier de confiance
// du produit. Tous les montants (livraison, commission, total) sont calculés ici, jamais
// reçus ni fait confiance depuis le client.
export async function getOrderPaymentSummary(req: AuthRequest, res: Response) {
  try {
    const buyerId = req.user!.id;
    const id = String(req.params.id);

    const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) return res.status(404).json({ success: false, message: 'Commande introuvable' });
    if (order.buyerId !== buyerId) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }
    if (order.status !== 'COURIER_VERIFIED') {
      return res.status(409).json({ success: false, message: "Cette commande n'est pas encore prête pour le paiement." });
    }

    let totalWeightKg = 0;
    for (const item of order.items) {
      const unitWeight = item.product.weight && item.product.weight > 0 ? item.product.weight : 1;
      totalWeightKg += unitWeight * item.quantity;
    }
    const fulfillment = await getOrderFulfillment(order.id);
    const deliveryFeeCDF = calculateDeliveryFeeCDF(
      order.items[0]?.product.weight ?? null,
      order.items.reduce((sum, it) => sum + it.quantity, 0),
      fulfillment
    );
    const commissionCDF = Math.round(order.totalCDF * PLATFORM_COMMISSION_RATE);
    const grandTotalCDF = order.totalCDF + deliveryFeeCDF + commissionCDF;

    return res.json({
      success: true,
      data: {
        order,
        totalWeightKg,
        fulfillment,
        subtotalCDF: order.totalCDF,
        subtotalUSD: order.totalUSD,
        deliveryFeeCDF,
        deliveryFeeUSD: cdfToUsd(deliveryFeeCDF, order),
        commissionRate: PLATFORM_COMMISSION_RATE,
        commissionCDF,
        commissionUSD: cdfToUsd(commissionCDF, order),
        grandTotalCDF,
        grandTotalUSD: cdfToUsd(grandTotalCDF, order),
      },
    });
  } catch (err) {
    console.error('Erreur getOrderPaymentSummary:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}

// PATCH /api/orders/:id/confirm — réservé au vendeur du produit concerné
export async function confirmOrder(req: AuthRequest, res: Response) {
  try {
    const sellerId = req.user!.id;
    const id = String(req.params.id);

    const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) return res.status(404).json({ success: false, message: 'Commande introuvable' });

    // Jamais de confiance dans une valeur envoyée par le client : on revérifie toujours
    // le vendeur réel du produit en base.
    const product = order.items[0]?.product;
    if (!product || product.seller.id !== sellerId) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    // Ferme la faille de course : si le délai de 12h est dépassé mais que le balayage
    // périodique n'est pas encore passé, on expire la commande ici avant toute autre
    // vérification, pour empêcher un vendeur de confirmer "en retard" une commande que
    // l'acheteur voit déjà comme annulée côté front.
    const justExpired = await expireIfNeeded(order as any);
    if (justExpired) {
      return res.status(409).json({ success: false, message: 'Le délai de confirmation de 12h est dépassé, cette commande a expiré.' });
    }
    if (order.status !== 'AWAITING_SELLER_CONFIRMATION') {
      return res.status(409).json({ success: false, message: 'Cette commande ne peut plus être confirmée' });
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
      include: ORDER_INCLUDE,
    });

    await notifier.create({
      userId: order.buyerId,
      type: 'ORDER',
      title: 'Commande confirmée',
      message: `Le vendeur a confirmé la disponibilité de "${product.title}". Un livreur CBFSOKO va récupérer et vérifier l'article avant expédition.`,
      link: '/orders',
      dedupeKey: `order:${id}:CONFIRMED:buyer`,
      actorId: sellerId,
    });

    return res.json({ success: true, order: updated });
  } catch (err) {
    console.error('Erreur confirmOrder:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}

// PATCH /api/orders/:id/deny — le vendeur signale que le produit n'est plus disponible
export async function denyOrder(req: AuthRequest, res: Response) {
  try {
    const sellerId = req.user!.id;
    const id = String(req.params.id);

    const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) return res.status(404).json({ success: false, message: 'Commande introuvable' });

    const product = order.items[0]?.product;
    if (!product || product.seller.id !== sellerId) {
      return res.status(403).json({ success: false, message: 'Accès refusé' });
    }

    // Même correctif de course que sur confirmOrder.
    const justExpired = await expireIfNeeded(order as any);
    if (justExpired) {
      return res.json({ success: true }); // déjà expirée, résultat équivalent pour le vendeur
    }
    if (order.status !== 'AWAITING_SELLER_CONFIRMATION') {
      return res.status(409).json({ success: false, message: 'Cette commande ne peut plus être modifiée' });
    }

    await prisma.order.update({ where: { id }, data: { status: 'EXPIRED' } });

    await notifier.create({
      userId: order.buyerId,
      type: 'ORDER',
      title: 'Produit indisponible',
      message: `"${product.title}" n'est plus disponible. Découvrez des produits similaires.`,
      link: '/orders',
      dedupeKey: `order:${id}:EXPIRED:buyer`,
      actorId: sellerId,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('Erreur denyOrder:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}

// PATCH /api/orders/:id/verify — réservé aux livreurs CBFSOKO (rôle COURIER) et aux admins.
// C'est le passage physique du livreur chez le vendeur : il récupère l'article, vérifie sa
// conformité (photos/état) et, une fois satisfait, fait basculer la commande vers
// COURIER_VERIFIED. C'est CE statut, et non la simple confirmation du vendeur, qui débloque
// le paiement côté acheteur (voir getOrderPaymentSummary) — c'est le cœur du contrôle qualité
// "Vérifié par CBFSOKO".
export async function verifyOrderByCourier(req: AuthRequest, res: Response) {
  try {
    const courierId = req.user!.id;

    const role = await getUserRole(courierId);
    const authorized = !!role && ['COURIER', 'ADMIN', 'SUPER_ADMIN'].includes(role);
    if (!authorized) {
      return res.status(403).json({ success: false, message: 'Accès réservé aux livreurs CBFSOKO' });
    }

    const id = String(req.params.id);
    const parsed = courierVerifySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Requête invalide' });
    }
    const { verificationNote, verificationPhotos } = parsed.data;

    const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) return res.status(404).json({ success: false, message: 'Commande introuvable' });

    // Seule une commande déjà confirmée par le vendeur peut passer en "vérifiée livreur" :
    // impossible de sauter l'étape de confirmation vendeur.
    if (order.status !== 'CONFIRMED') {
      return res.status(409).json({
        success: false,
        message: "Cette commande doit d'abord être confirmée par le vendeur avant la vérification livreur.",
      });
    }

    // Dispatch manuel : la commande doit d'abord avoir été assignée par un admin.
    // Un livreur ne peut vérifier que SES propres commandes assignées ; un admin peut
    // toujours passer outre (support/dépannage), mais un livreur ne peut jamais
    // s'auto-assigner une commande via cette route.
    const requesterIsAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
    if (!order.courierId) {
      return res.status(409).json({
        success: false,
        message: "Cette commande n'a pas encore été assignée à un livreur par un administrateur.",
      });
    }
    if (!requesterIsAdmin && order.courierId !== courierId) {
      return res.status(403).json({ success: false, message: 'Cette commande est assignée à un autre livreur.' });
    }

    const updated = await prisma.order.update({
      where: { id },
      data: {
        status: 'COURIER_VERIFIED',
        verifiedAt: new Date(),
        verificationNote: verificationNote ?? null,
        verificationPhotos: verificationPhotos ?? [],
      },
      include: ORDER_INCLUDE,
    });

    const product = order.items[0]?.product;
    await notifier.create({
      userId: order.buyerId,
      type: 'ORDER',
      title: 'Vérifié par CBFSOKO',
      message: product
        ? `"${product.title}" a été vérifié par notre livreur. Vous pouvez procéder au paiement en toute confiance.`
        : 'Votre article a été vérifié par notre livreur. Vous pouvez procéder au paiement.',
      link: '/orders',
      dedupeKey: `order:${id}:COURIER_VERIFIED:buyer`,
    });

    return res.json({ success: true, order: updated });
  } catch (err) {
    console.error('Erreur verifyOrderByCourier:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}

// PATCH /api/orders/:id/assign-courier — réservé aux admins : dispatch manuel d'un livreur
// sur une commande déjà confirmée par le vendeur. C'est ce qui fait apparaître la commande
// dans la file d'attente du livreur (GET /orders/courier/mine).
export async function assignCourier(req: AuthRequest, res: Response) {
  try {
    const adminId = req.user!.id;
    const admin = await isAdmin(adminId);
    if (!admin) {
      return res.status(403).json({ success: false, message: 'Accès réservé aux administrateurs' });
    }

    const id = String(req.params.id);
    const parsed = assignCourierSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Requête invalide' });
    }
    const { courierId } = parsed.data;

    const order = await prisma.order.findUnique({ where: { id }, include: ORDER_INCLUDE });
    if (!order) return res.status(404).json({ success: false, message: 'Commande introuvable' });
    if (order.status !== 'CONFIRMED') {
      return res.status(409).json({
        success: false,
        message: 'Seule une commande confirmée par le vendeur peut être assignée à un livreur.',
      });
    }

    // On revérifie toujours en base que la cible est bien un livreur actif, jamais fait
    // confiance à l'id fourni par le client sans validation de son rôle réel.
    const courier = await prisma.user.findUnique({ where: { id: courierId }, select: { id: true, role: true, name: true } });
    if (!courier || courier.role !== 'COURIER') {
      return res.status(400).json({ success: false, message: "Cet utilisateur n'est pas un livreur CBFSOKO." });
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { courierId, courierAssignedAt: new Date() },
      include: ORDER_INCLUDE,
    });

    const product = order.items[0]?.product;
    await prisma.notification.create({
      data: {
        userId: courierId,
        title: 'Nouvelle collecte à effectuer',
        message: product
          ? `Récupérez et vérifiez "${product.title}" chez le vendeur, puis validez sur votre espace livreur.`
          : 'Une nouvelle collecte vous a été assignée.',
      },
    });

    return res.json({ success: true, order: updated });
  } catch (err) {
    console.error('Erreur assignCourier:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}

// GET /api/orders/admin/couriers — réservé aux admins : liste des livreurs actifs,
// pour peupler le sélecteur d'assignation.
export async function listAvailableCouriers(req: AuthRequest, res: Response) {
  try {
    const admin = await isAdmin(req.user!.id);
    if (!admin) {
      return res.status(403).json({ success: false, message: 'Accès réservé aux administrateurs' });
    }

    const couriers = await prisma.user.findMany({
      where: { role: 'COURIER' },
      select: { id: true, name: true, avatar: true },
      orderBy: { name: 'asc' },
    });

    return res.json({ success: true, data: couriers });
  } catch (err) {
    console.error('Erreur listAvailableCouriers:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}

// GET /api/orders/admin/pending-assignment — réservé aux admins : commandes confirmées par
// le vendeur mais pas encore assignées à un livreur (file de dispatch).
export async function listPendingAssignment(req: AuthRequest, res: Response) {
  try {
    const admin = await isAdmin(req.user!.id);
    if (!admin) {
      return res.status(403).json({ success: false, message: 'Accès réservé aux administrateurs' });
    }

    const orders = await prisma.order.findMany({
      where: { status: 'CONFIRMED', courierId: null },
      include: COURIER_ORDER_INCLUDE,
      orderBy: { confirmedAt: 'asc' },
    });

    return res.json({ success: true, data: orders });
  } catch (err) {
    console.error('Erreur listPendingAssignment:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}

// GET /api/orders/courier/mine — alimente CourierQueue.tsx : tout ce qui a été assigné à
// CE livreur (à vérifier ou déjà traité récemment), le plus ancien d'abord pour les commandes
// en attente afin de prioriser les collectes les plus urgentes.
export async function getCourierOrders(req: AuthRequest, res: Response) {
  try {
    const courierId = req.user!.id;
    const role = await getUserRole(courierId);
    if (role !== 'COURIER' && role !== 'ADMIN' && role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, message: 'Accès réservé aux livreurs CBFSOKO' });
    }

    const orders = await prisma.order.findMany({
      where: { courierId },
      include: COURIER_ORDER_INCLUDE,
      orderBy: { courierAssignedAt: 'desc' },
    });

    // Coordonnées de livraison (nom, téléphone, adresse, repère) : visibles du livreur seulement.
    const deliveries = await loadDeliveries(orders.map((o) => o.id));
    const data = orders.map((o) => {
      const d = deliveries.get(o.id);
      return { ...o, delivery: d ?? null, deliveryAddress: d ? formatDeliveryAddress(d) : (o as { deliveryAddress?: string | null }).deliveryAddress ?? null };
    });

    return res.json({ success: true, data });
  } catch (err) {
    console.error('Erreur getCourierOrders:', err);
    return res.status(500).json({ success: false, message: 'Erreur serveur' });
  }
}