import type { PrismaClient } from '@prisma/client';
import webpush from 'web-push';
import { getAccountStatus, mergePreferences, type NotifPrefs } from '../lib/accountState';

/**
 * Service de notifications : enregistrement en base (dédoublonné), envoi push (Web Push / VAPID)
 * et génération automatique des notifications :
 *  - nouveau produit (abonnés du vendeur en priorité, puis tous les utilisateurs),
 *  - nouvelle boutique (tous les utilisateurs),
 *  - changement de statut d'une commande (le vendeur est renvoyé vers la conversation de l'acheteur),
 *  - nouveau message, appel manqué.
 *
 * Avant chaque envoi : le compte du destinataire doit être actif, le type de notification ne doit pas
 * être désactivé dans ses paramètres, et aucun blocage ne doit exister entre lui et l'expéditeur.
 *
 * Le push n'est actif que si VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY et VAPID_SUBJECT sont définis.
 * Sinon les notifications restent disponibles dans l'application (page Notifications).
 */

export type NotificationType = 'SYSTEM' | 'ORDER' | 'PRODUCT' | 'COMMENT' | 'MESSAGE' | 'PAYMENT';

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  /** Chemin interne du site (ex. /products/abc). Toute autre valeur est ignorée. */
  link?: string | null;
  /** Clé d'unicité : une même clé ne crée jamais deux notifications. */
  dedupeKey?: string | null;
  /** Personne à l'origine de la notification : sa photo de profil est affichée (comme Facebook). */
  actorId?: string | null;
  /** Réglage utilisateur qui contrôle cette notification (par défaut déduit du type). */
  prefKey?: keyof NotifPrefs;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
  /** Logo CBF SOKO (toujours présent). */
  icon?: string;
  /** Photo de l'expéditeur, si la notification vient d'une personne. */
  avatar?: string;
}

export interface BroadcastInput {
  type: NotificationType;
  title: string;
  message: string;
  link?: string | null;
  actorId?: string | null;
  prefKey?: keyof NotifPrefs;
  /** Préfixe de la clé d'unicité : la clé finale est `${dedupePrefix}:${userId}`. */
  dedupePrefix: string;
  /** Si fourni, seuls ces utilisateurs sont visés. */
  onlyUserIds?: string[];
  excludeUserIds?: string[];
  titleOverride?: string;
}

export type NotificationService = ReturnType<typeof createNotificationService>;

const clip = (value: string, max: number): string => String(value).trim().slice(0, max);

// Un lien de notification doit rester interne : "/..." mais jamais "//..." (redirection externe).
const safeLink = (link?: string | null): string | null => {
  if (!link || typeof link !== 'string') return null;
  if (!link.startsWith('/') || link.startsWith('//')) return null;
  return link.slice(0, 300);
};

const PREF_BY_TYPE: Partial<Record<NotificationType, keyof NotifPrefs>> = {
  ORDER: 'orders',
  MESSAGE: 'messages',
  PRODUCT: 'products',
  PAYMENT: 'payments',
};

const MAX_BROADCAST = 5000;

async function inChunks<T>(items: T[], size: number, worker: (item: T) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(worker));
  }
}

const firstOrigin = (): string => (process.env.FRONTEND_URL || '').split(',')[0].trim().replace(/\/+$/, '');

/** Logo affiché sur les notifications push. Copiez CBF.jpg dans le dossier public du frontend. */
const logoUrl = (): string | undefined => {
  const explicit = (process.env.PUSH_ICON_URL || '').trim();
  if (explicit) return explicit;
  const origin = firstOrigin();
  return origin ? `${origin}/CBF.jpg` : undefined;
};

const absoluteAvatar = (avatar?: string | null): string | undefined => {
  if (!avatar) return undefined;
  if (/^https?:\/\//i.test(avatar)) return avatar;
  const api = (process.env.PUBLIC_API_URL || '').trim().replace(/\/+$/, '').replace(/\/api$/, '');
  return api ? `${api}/${avatar.replace(/\\/g, '/').replace(/^\/+/, '')}` : undefined;
};

export function createNotificationService(prisma: PrismaClient) {
  const publicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
  const subject = (process.env.VAPID_SUBJECT || '').trim();

  let pushEnabled = false;
  if (publicKey && privateKey && subject) {
    try {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      pushEnabled = true;
    } catch (error) {
      console.error('[push] Clés VAPID invalides, notifications push désactivées :', (error as Error).message);
    }
  } else {
    console.warn("[push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT absents : notifications push désactivées (les notifications dans l'application restent actives).");
  }

  /** Envoie un push à tous les appareils abonnés d'un utilisateur. Retourne le nombre d'envois acceptés. */
  const sendPush = async (userId: string, payload: PushPayload): Promise<number> => {
    if (!pushEnabled) return 0;
    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId }, take: 20 });
    let delivered = 0;
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ icon: logoUrl(), ...payload }),
            { TTL: 60 * 60 * 12 }
          );
          delivered += 1;
        } catch (error: any) {
          const status = error?.statusCode;
          if (status === 404 || status === 410) {
            // Abonnement expiré ou révoqué côté navigateur : on le retire.
            await prisma.pushSubscription.deleteMany({ where: { id: sub.id } }).catch(() => undefined);
          } else {
            console.error('[push] Envoi échoué', status || error?.message);
          }
        }
      })
    );
    return delivered;
  };

  /** Faut-il vraiment notifier cet utilisateur ? (compte actif, réglage activé, aucun blocage) */
  const shouldDeliver = async (input: Pick<NotifyInput, 'userId' | 'type' | 'actorId' | 'prefKey'>): Promise<boolean> => {
    try {
      if (input.actorId && input.actorId === input.userId) return false;
      const status = await getAccountStatus(input.userId);
      if (status !== 'ACTIVE') return false; // compte en pause, en suppression ou introuvable : aucune notification

      const key = input.prefKey ?? PREF_BY_TYPE[input.type];
      if (key) {
        const row = await prisma.userPreferences.findUnique({ where: { userId: input.userId }, select: { data: true } });
        if (mergePreferences(row?.data).notifications[key] === false) return false;
      }

      if (input.actorId) {
        const blocked = await prisma.blockedUser.findFirst({
          where: {
            OR: [
              { blockerId: input.userId, blockedId: input.actorId },
              { blockerId: input.actorId, blockedId: input.userId },
            ],
          },
          select: { id: true },
        });
        if (blocked) return false;
      }
      return true;
    } catch (error) {
      console.error('[notifications] Vérification impossible, notification ignorée :', (error as Error).message);
      return false;
    }
  };

  const actorAvatarOf = async (actorId?: string | null): Promise<string | undefined> => {
    if (!actorId) return undefined;
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { avatar: true } });
    return absoluteAvatar(actor?.avatar);
  };

  /** Crée une notification (sans doublon) puis tente le push. */
  const create = async (input: NotifyInput): Promise<{ created: boolean; pushed: number }> => {
    try {
      if (!(await shouldDeliver(input))) return { created: false, pushed: 0 };
      const notification = await prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: clip(input.title, 120),
          message: clip(input.message, 400),
          link: safeLink(input.link),
          dedupeKey: input.dedupeKey ?? null,
          actorId: input.actorId ?? null,
        },
      });
      const pushed = await sendPush(input.userId, {
        title: notification.title,
        body: notification.message,
        url: notification.link || '/notifications',
        tag: notification.dedupeKey || notification.id,
        avatar: await actorAvatarOf(input.actorId),
      });
      return { created: true, pushed };
    } catch (error: any) {
      if (error?.code === 'P2002') return { created: false, pushed: 0 }; // doublon : déjà notifié
      console.error('[notifications] Création impossible :', error?.message || error);
      return { created: false, pushed: 0 };
    }
  };

  /**
   * Envoie la même notification à de nombreux utilisateurs (nouveau produit, nouvelle boutique).
   * Chaque utilisateur n'est notifié qu'une fois (dedupePrefix) ; les réglages et blocages sont respectés.
   */
  const broadcast = async (input: BroadcastInput): Promise<number> => {
    try {
      const exclude = new Set<string>([...(input.excludeUserIds ?? []), ...(input.actorId ? [input.actorId] : [])]);
      let ids: string[];
      if (input.onlyUserIds) {
        ids = [...new Set(input.onlyUserIds)];
        if (ids.length > 0) {
          const active = await prisma.user.findMany({ where: { id: { in: ids }, accountStatus: 'ACTIVE' }, select: { id: true } });
          ids = active.map((u) => u.id);
        }
      } else {
        const users = await prisma.user.findMany({ where: { accountStatus: 'ACTIVE' }, select: { id: true }, take: MAX_BROADCAST });
        ids = users.map((u) => u.id);
      }
      ids = ids.filter((id) => !exclude.has(id));
      if (ids.length === 0) return 0;

      const key = input.prefKey ?? PREF_BY_TYPE[input.type];
      if (key) {
        const rows = await prisma.userPreferences.findMany({ where: { userId: { in: ids } }, select: { userId: true, data: true } });
        const off = new Set(rows.filter((r) => mergePreferences(r.data).notifications[key] === false).map((r) => r.userId));
        ids = ids.filter((id) => !off.has(id));
      }

      if (input.actorId && ids.length > 0) {
        const blocks = await prisma.blockedUser.findMany({
          where: {
            OR: [
              { blockerId: input.actorId, blockedId: { in: ids } },
              { blockedId: input.actorId, blockerId: { in: ids } },
            ],
          },
          select: { blockerId: true, blockedId: true },
        });
        const blocked = new Set(blocks.flatMap((b) => [b.blockerId, b.blockedId]));
        ids = ids.filter((id) => !blocked.has(id));
      }
      if (ids.length === 0) return 0;

      const keyFor = (id: string) => `${input.dedupePrefix}:${id}`;
      const existing = await prisma.notification.findMany({
        where: { dedupeKey: { in: ids.map(keyFor) } },
        select: { dedupeKey: true },
      });
      const already = new Set(existing.map((e) => e.dedupeKey));
      const targets = ids.filter((id) => !already.has(keyFor(id)));
      if (targets.length === 0) return 0;

      await prisma.notification.createMany({
        data: targets.map((id) => ({
          userId: id,
          type: input.type,
          title: clip(input.title, 120),
          message: clip(input.message, 400),
          link: safeLink(input.link),
          dedupeKey: keyFor(id),
          actorId: input.actorId ?? null,
        })),
        skipDuplicates: true,
      });

      if (pushEnabled) {
        const avatar = await actorAvatarOf(input.actorId);
        await inChunks(targets, 10, (id) =>
          sendPush(id, {
            title: clip(input.title, 120),
            body: clip(input.message, 400),
            url: safeLink(input.link) || '/notifications',
            tag: keyFor(id),
            avatar,
          })
        );
      }
      return targets.length;
    } catch (error) {
      console.error('[notifications] Diffusion impossible :', (error as Error).message);
      return 0;
    }
  };

  /** Un vendeur publie un produit : ses abonnés d'abord, puis tous les autres utilisateurs. */
  const notifyNewProduct = async (args: {
    sellerId: string;
    sellerName: string;
    productId: string;
    title: string;
    isRequest?: boolean;
  }): Promise<number> => {
    const followers = await prisma.follow.findMany({
      where: { followingId: args.sellerId },
      select: { followerId: true },
      take: MAX_BROADCAST,
    });
    const followerIds = followers.map((f) => f.followerId);
    const product = clip(args.title, 80);
    const link = `/products/${args.productId}`;
    const dedupePrefix = `product:${args.productId}`;
    const heading = args.isRequest ? 'Nouvelle demande publiée' : 'Nouveau produit';

    const toFollowers = await broadcast({
      type: 'PRODUCT',
      title: heading,
      message: `${args.sellerName} a publié « ${product} ».`,
      link,
      actorId: args.sellerId,
      dedupePrefix,
      onlyUserIds: followerIds,
    });
    const toOthers = await broadcast({
      type: 'PRODUCT',
      title: heading,
      message: `${args.sellerName} vient de publier « ${product} ».`,
      link,
      actorId: args.sellerId,
      dedupePrefix,
      excludeUserIds: followerIds,
    });
    return toFollowers + toOthers;
  };

  /** Ancien nom, conservé pour compatibilité. */
  const notifyFollowersOfNewProduct = notifyNewProduct;

  /** Nouvelle boutique : prévient tous les utilisateurs (réglage « nouvelles boutiques »). */
  const notifyNewShop = async (shop: { id: string; name: string; ownerId: string }): Promise<number> =>
    broadcast({
      type: 'PRODUCT',
      prefKey: 'shops',
      title: 'Nouvelle boutique',
      message: `${clip(shop.name, 60)} vient d'ouvrir sur CBF SOKO.`,
      link: '/boutique',
      actorId: shop.ownerId,
      dedupePrefix: `shop:${shop.id}`,
    });

  /** Rattrape les boutiques créées récemment (peu importe où elles sont créées). Sans doublon. */
  const sweepNewShopNotifications = async (): Promise<void> => {
    const since = new Date(Date.now() - 30 * 60 * 1000);
    const shops = await prisma.shop.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, name: true, ownerId: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    for (const shop of shops) await notifyNewShop(shop);
  };

  /**
   * Nouveau message : une seule notification non lue par conversation (elle est mise à jour au lieu d'en
   * empiler dix), cliquable vers la conversation.
   */
  const notifyNewMessage = async (args: { receiverId: string; senderId: string; senderName: string; preview: string }): Promise<void> => {
    try {
      const input = { userId: args.receiverId, type: 'MESSAGE' as const, actorId: args.senderId };
      if (!(await shouldDeliver(input))) return;
      const link = `/messages?with=${encodeURIComponent(args.senderId)}`;
      const existing = await prisma.notification.findFirst({
        where: { userId: args.receiverId, type: 'MESSAGE', actorId: args.senderId, isRead: false },
        select: { id: true },
      });
      if (existing) {
        await prisma.notification.update({
          where: { id: existing.id },
          data: { title: clip(args.senderName, 120), message: clip(args.preview, 400), link, createdAt: new Date() },
        });
      } else {
        await prisma.notification.create({
          data: {
            userId: args.receiverId,
            type: 'MESSAGE',
            title: clip(args.senderName, 120),
            message: clip(args.preview, 400),
            link,
            actorId: args.senderId,
          },
        });
      }
      await sendPush(args.receiverId, {
        title: clip(args.senderName, 120),
        body: clip(args.preview, 400),
        url: link,
        tag: `message:${args.senderId}`,
        avatar: await actorAvatarOf(args.senderId),
      });
    } catch (error) {
      console.error('[notifications] Notification de message impossible :', (error as Error).message);
    }
  };

  /** Appel manqué : cliquable vers la conversation avec l'appelant. */
  const notifyMissedCall = async (args: { receiverId: string; callerId: string; callerName: string; video: boolean }): Promise<void> => {
    await create({
      userId: args.receiverId,
      type: 'MESSAGE',
      title: clip(args.callerName, 120),
      message: args.video ? 'Appel vidéo manqué' : 'Appel manqué',
      link: `/messages?with=${encodeURIComponent(args.callerId)}`,
      actorId: args.callerId,
    });
  };

  const ORDER_WINDOW_MS = 30 * 60 * 1000;

  /**
   * Rattrape les changements de statut de commande récents et crée les notifications
   * correspondantes. Indépendant du contrôleur des commandes : chaque couple
   * (commande, statut, destinataire) n'est notifié qu'une fois grâce à dedupeKey.
   * Le vendeur est renvoyé vers la conversation de l'acheteur (où se trouvent les boutons Confirmer / Indisponible).
   */
  const sweepOrderNotifications = async (): Promise<void> => {
    const since = new Date(Date.now() - ORDER_WINDOW_MS);
    const orders = await prisma.order.findMany({
      where: { updatedAt: { gte: since } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        status: true,
        buyerId: true,
        sellerId: true,
        buyer: { select: { name: true } },
        items: { take: 1, select: { product: { select: { title: true } } } },
      },
    });

    for (const order of orders) {
      const label = order.items[0]?.product?.title ? `« ${clip(order.items[0].product.title, 60)} »` : 'votre commande';
      const buyerName = order.buyer?.name || 'Un acheteur';
      const jobs: { userId: string; role: 'buyer' | 'seller'; title: string; message: string }[] = [];

      switch (order.status) {
        case 'AWAITING_SELLER_CONFIRMATION':
          if (order.sellerId) jobs.push({ userId: order.sellerId, role: 'seller', title: 'Nouvelle commande', message: `${buyerName} souhaite se faire livrer ${label}. Confirmez la disponibilité rapidement.` });
          break;
        case 'CONFIRMED':
          jobs.push({ userId: order.buyerId, role: 'buyer', title: 'Commande confirmée', message: `Le vendeur a confirmé ${label}. Un livreur va passer récupérer l'article.` });
          break;
        case 'COURIER_VERIFIED':
          jobs.push({ userId: order.buyerId, role: 'buyer', title: 'Article vérifié', message: `Le livreur a vérifié ${label}. Vous pouvez payer.` });
          break;
        case 'SHIPPED':
          jobs.push({ userId: order.buyerId, role: 'buyer', title: 'Commande en route', message: `${label} est en cours de livraison.` });
          break;
        case 'DELIVERED':
          jobs.push({ userId: order.buyerId, role: 'buyer', title: 'Livraison confirmée', message: `La livraison de ${label} est confirmée.` });
          if (order.sellerId) jobs.push({ userId: order.sellerId, role: 'seller', title: 'Livraison confirmée', message: `La livraison de ${label} à ${buyerName} est confirmée.` });
          break;
        case 'CANCELLED':
          jobs.push({ userId: order.buyerId, role: 'buyer', title: 'Commande annulée', message: `La commande ${label} a été annulée.` });
          if (order.sellerId) jobs.push({ userId: order.sellerId, role: 'seller', title: 'Commande annulée', message: `La commande de ${buyerName} (${label}) a été annulée.` });
          break;
        case 'EXPIRED':
          jobs.push({ userId: order.buyerId, role: 'buyer', title: 'Demande expirée', message: `Le vendeur n'a pas répondu à temps pour ${label}.` });
          if (order.sellerId) jobs.push({ userId: order.sellerId, role: 'seller', title: 'Demande expirée', message: `Le délai de réponse pour la commande de ${buyerName} est dépassé.` });
          break;
        default:
          break;
      }

      for (const job of jobs) {
        await create({
          userId: job.userId,
          type: 'ORDER',
          title: job.title,
          message: job.message,
          // Vendeur : conversation de l'acheteur. Acheteur : page de ses commandes.
          link: job.role === 'seller' ? `/messages?with=${encodeURIComponent(order.buyerId)}` : '/orders',
          dedupeKey: `order:${order.id}:${order.status}:${job.role}`,
          actorId: job.role === 'seller' ? order.buyerId : order.sellerId,
        });
      }
    }
  };

  return {
    pushEnabled,
    publicKey: pushEnabled ? publicKey : null,
    create,
    broadcast,
    sendPush,
    notifyNewProduct,
    notifyFollowersOfNewProduct,
    notifyNewShop,
    notifyNewMessage,
    notifyMissedCall,
    sweepNewShopNotifications,
    sweepOrderNotifications,
  };
}
