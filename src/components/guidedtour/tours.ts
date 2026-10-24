import type { TourStep } from './GuidedTour';

/** Étapes de chaque page. Chaque `target` correspond à un attribut data-tour réellement présent dans la page. */

export const NOTIFICATIONS_TOUR: TourStep[] = [
  {
    id: 'welcome',
    title: 'Bienvenue dans vos notifications',
    body: 'Vos messages, commandes, paiements et les nouveautés des vendeurs que vous suivez arrivent ici. Ce guide dure moins d’une minute.',
  },
  {
    id: 'filters',
    target: 'notif-filters',
    title: 'Toutes ou seulement les non lues',
    body: 'Les notifications non lues ont un point orange. Passez sur « Non lues » pour ne voir que ce qui est nouveau.',
    action: { type: 'click', hint: 'touchez « Non lues », puis revenez sur « Toutes ».' },
  },
  {
    id: 'item',
    target: 'notif-item',
    title: 'Ouvrir une notification',
    body: 'Touchez une notification : elle est marquée comme lue et vous êtes emmené directement sur le produit ou la commande concernée. Exemple : « Commande confirmée ».',
  },
  {
    id: 'empty',
    target: 'notif-empty',
    title: 'Rien pour le moment',
    body: 'Dès qu’un vendeur suivi publie un produit ou qu’une commande change de statut, une notification apparaîtra ici.',
  },
  {
    id: 'read-all',
    target: 'notif-readall',
    title: 'Tout marquer comme lu',
    body: 'Un seul geste pour effacer tous les points orange.',
    action: { type: 'click', hint: 'touchez « Tout marquer comme lu ».' },
  },
  {
    id: 'push',
    target: 'notif-push',
    title: 'Notifications sur votre téléphone (facultatif)',
    body: 'Touchez « Activer », puis acceptez la demande de votre navigateur. Vous recevrez alors les alertes même site fermé. Vous pouvez très bien ne pas l’activer : tout reste visible ici.',
  },
  {
    id: 'help',
    target: 'tour-help',
    title: 'Revoir ce guide',
    body: 'Ce bouton « Aide » relance le tutoriel quand vous voulez.',
  },
];

export const BOUTIQUE_TOUR: TourStep[] = [
  {
    id: 'welcome',
    title: 'Les boutiques partenaires',
    body: 'Ici, vous retrouvez les vendeurs de confiance de CBF SOKO. Voyons comment trouver la bonne boutique.',
  },
  {
    id: 'search',
    target: 'boutique-search',
    title: 'Rechercher une boutique',
    body: 'Tapez le nom d’une boutique : la liste se met à jour toute seule.',
    action: { type: 'input', hint: 'tapez quelques lettres du nom d’une boutique.' },
  },
  {
    id: 'categories',
    target: 'boutique-categories',
    title: 'Filtrer par catégorie',
    body: 'Choisissez une catégorie pour ne garder que les boutiques qui y vendent des articles.',
    action: { type: 'click', hint: 'touchez une catégorie (ou « Toutes »).' },
  },
  {
    id: 'sort',
    target: 'boutique-sort',
    title: 'Trier les résultats',
    body: 'Du plus récent au plus fourni en articles, ou par ordre alphabétique.',
    action: { type: 'click', hint: 'ouvrez la liste de tri.' },
  },
  {
    id: 'shop',
    target: 'boutique-shop',
    title: 'Une carte = une boutique',
    body: 'Vous voyez son nom, sa catégorie principale et son nombre d’articles. Le badge « Vérifiée » indique une boutique contrôlée.',
  },
  {
    id: 'visit',
    target: 'boutique-visit',
    title: 'Visiter la boutique',
    body: 'Ce bouton ouvre la boutique et ses articles. Sur la fiche d’un article, vous pourrez l’ajouter à vos favoris, contacter le vendeur ou demander la livraison.',
  },
  {
    id: 'help',
    target: 'tour-help',
    title: 'Revoir ce guide',
    body: 'Le bouton « Aide » relance le tutoriel à tout moment.',
  },
];

export const PRODUCT_TOUR: TourStep[] = [
  {
    id: 'gallery',
    target: 'product-gallery',
    title: 'Les photos du produit',
    body: 'Faites glisser les photos vers la gauche ou la droite pour les voir toutes. Le compteur en haut indique où vous en êtes.',
    placement: 'bottom',
  },
  {
    id: 'video',
    target: 'product-video',
    title: 'La vidéo du vendeur',
    body: 'Lancez la vidéo pour voir le produit en situation avant de décider.',
  },
  {
    id: 'price',
    target: 'product-price',
    title: 'Le titre et le prix',
    body: 'Le prix est affiché en dollars et, quand le vendeur l’a renseigné, en francs congolais.',
  },
  {
    id: 'favorite',
    target: 'product-favorite',
    title: 'Garder ce produit en favori',
    body: 'Touchez le cœur pour le retrouver plus tard. Il vous faudra être connecté.',
  },
  {
    id: 'info',
    target: 'product-info',
    title: 'Se renseigner avant d’acheter',
    body: '« Se renseigner » ouvre la page de renseignements du produit, sans engagement.',
  },
  {
    id: 'deliver',
    target: 'product-deliver',
    title: 'Se faire livrer',
    body: 'Ce bouton vous amène directement au formulaire de livraison, plus bas dans la page.',
    action: { type: 'click', hint: 'touchez « Me faire livrer ».' },
  },
  {
    id: 'quantity',
    target: 'product-quantity',
    title: 'Choisir la quantité',
    body: 'Utilisez + et − . Le total se recalcule tout seul et ne dépasse jamais le stock disponible.',
    action: { type: 'click', hint: 'touchez + ou −.' },
  },
  {
    id: 'address',
    target: 'product-address',
    title: 'Indiquer où vous livrer',
    body: 'Écrivez la commune, le quartier, l’avenue et le numéro. Exemple : « Bagira, Camp TV, avenue Kasali n°12 ».',
    action: { type: 'input', hint: 'écrivez votre adresse.' },
  },
  {
    id: 'confirm',
    target: 'product-confirm',
    title: 'Confirmer la livraison',
    body: 'Ce bouton envoie votre demande au vendeur, qui doit la confirmer. Si vous n’êtes pas connecté, on vous le demandera d’abord. Vous suivrez ensuite la commande dans « Mes commandes ».',
  },
  {
    id: 'seller',
    target: 'product-seller',
    title: 'Qui vend ce produit ?',
    body: 'Le nom du vendeur, sa localisation et sa note (donnée uniquement par des acheteurs ayant reçu une commande).',
  },
  {
    id: 'contact',
    target: 'product-contact',
    title: 'Poser une question au vendeur',
    body: 'Le contact se fait par message, directement dans l’application.',
  },
  {
    id: 'similar',
    target: 'product-similar',
    title: 'Produits similaires',
    body: 'Faites défiler vers la droite pour comparer avec d’autres articles de la même catégorie.',
  },
  {
    id: 'help',
    target: 'tour-help',
    title: 'Revoir ce guide',
    body: 'Le bouton « Aide » relance le tutoriel à tout moment.',
  },
];
