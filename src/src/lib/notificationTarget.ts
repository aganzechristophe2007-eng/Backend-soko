/**
 * Destination d'un clic sur une notification.
 * Le serveur fournit un `link` interne dans la plupart des cas (commande → conversation de l'acheteur,
 * produit → fiche, boutique → page boutique, message → conversation). Les anciennes notifications créées
 * sans lien reçoivent une destination par défaut selon leur type.
 */

export interface NotificationLike {
  type: string;
  link: string | null;
  actor?: { id: string } | null;
}

const isInternal = (link: string | null | undefined): link is string =>
  !!link && link.startsWith('/') && !link.startsWith('//');

export function resolveNotificationTarget(n: NotificationLike): string | null {
  if (isInternal(n.link)) return n.link;
  switch (n.type) {
    case 'ORDER': return '/orders';
    case 'MESSAGE':
    case 'COMMENT': return n.actor?.id ? `/messages?with=${encodeURIComponent(n.actor.id)}` : '/messages';
    case 'PAYMENT': return '/wallet';
    case 'PRODUCT': return '/';
    default: return null;
  }
}

export type NotificationKind = 'order' | 'message' | 'product' | 'shop' | 'payment' | 'system';

export function notificationKind(n: NotificationLike): NotificationKind {
  if (n.link && (n.link.startsWith('/boutique') || n.link.startsWith('/shops'))) return 'shop';
  switch (n.type) {
    case 'ORDER': return 'order';
    case 'MESSAGE':
    case 'COMMENT': return 'message';
    case 'PRODUCT': return 'product';
    case 'PAYMENT': return 'payment';
    default: return 'system';
  }
}
