# CBF SOKO — mise à jour Paramètres / Livraison / Notifications / Messages

Deux zips : `backend-modifications.zip` (fichiers à copier dans votre dossier backend) et
`frontend-modifications.zip` (à copier dans votre dossier frontend). Chaque zip ne contient QUE les fichiers
modifiés ou ajoutés, dans la même arborescence que vos projets : copiez-les en acceptant le remplacement.

## 1. Backend — à faire dans l'ordre

1. Copier le contenu de `backend-modifications.zip` (y compris `server.ts` à la racine du backend).
2. Ouvrir `prisma/SCHEMA_AJOUTS.prisma.txt` et reporter les ajouts dans votre `prisma/schema.prisma`
   (3 champs dans `User`, 1 champ dans `Notification`, 1 champ `negotiable` dans `Product`, 3 nouveaux models). Je n'avais pas votre schéma : c'est la seule étape manuelle.
3. Lancer :
   ```
   npx prisma migrate dev --name settings_delivery_notifications
   npx prisma generate
   ```
   (en production : `npx prisma migrate deploy`). Aucune nouvelle dépendance npm n'est nécessaire.
4. Facultatif, variables d'environnement : `PUSH_ICON_URL` (adresse du logo affiché sur les notifications push) et
   `PUBLIC_API_URL` (déjà utilisée ailleurs).

## 2. Frontend — à faire

1. Copier le contenu de `frontend-modifications.zip` dans votre dossier `src`.
2. Copier `src/CBF.jpg` dans le dossier `public/` (même nom) : c'est le logo utilisé par les notifications push.
3. Dans votre `public/sw.js`, votre gestionnaire `push` doit utiliser la photo et le logo. Exemple à fusionner avec le vôtre :
   ```js
   self.addEventListener('push', (event) => {
     let data = {};
     try { data = event.data ? event.data.json() : {}; } catch (e) {}
     event.waitUntil(Promise.all([
       self.registration.showNotification(data.title || 'CBF SOKO', {
         body: data.body || '',
         icon: data.avatar || data.icon || '/CBF.jpg',   // photo de la personne, sinon logo
         badge: data.icon || '/CBF.jpg',                  // logo CBF SOKO
         tag: data.tag,
         data: { url: data.url || '/notifications' },
       }),
       self.clients.matchAll({ type: 'window' }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'cbfsoko:push' }))),
     ]));
   });
   ```
4. Vous lancerez `npm run build` vous-même.

## 3. Ce qui a été fait

**Paramètres (façon Facebook)** : menu par lots — Compte (informations, sécurité, confidentialité), Préférences
(notifications, affichage), Activité et boutique (mes annonces, mon évolution, mode vacances, adresse de livraison),
Paiements, Zone sensible. Sur mobile le menu s'ouvre puis chaque lot a sa page ; sur ordinateur le menu reste à gauche.
Nouveaux paramètres : visibilité du profil, messages des inconnus, utilisateurs bloqués, notifications par type
(commandes, messages, produits, boutiques, paiements), push par appareil, mode vacances, adresse par défaut,
**mise en pause du compte**, **suppression avec délai de 30 jours** (annulable).

**Compte en pause** : tout est masqué (profil, boutique, annonces), plus de messages ni de notifications, aucune action possible,
réactivation uniquement par le bouton manuel (bandeau en haut de l'app + Paramètres). Suppression : le compte est masqué tout de suite,
puis anonymisé définitivement après 30 jours. Refusée s'il reste des commandes en cours ou de l'argent dans le portefeuille.

**Fiche produit** : refonte (galerie, vignettes, pastilles, barre d'action fixe sur mobile, partage, stock faible, vendu,
vendeur en vacances). « Me faire livrer » ouvre une fenêtre : quantité, livraison ou retrait chez le vendeur, destinataire,
téléphone, ville/commune/quartier/adresse/repère, paiement (portefeuille ou Mobile Money), note, récapitulatif.
Le vendeur ne voit pas le téléphone ni l'adresse exacte : ils vont au livreur (file d'attente du livreur). La commande crée la
conversation avec le vendeur et le notifie. **« Me renseigner »** : questions rapides cochables puis conversation.

**Notifications** : toutes cliquables. Commande → le vendeur arrive dans la conversation de l'acheteur. Nouveau produit et
nouvelle boutique → envoyés à tous (réglage pour les désactiver), abonnés servis en premier. Appel manqué et message : cliquables vers la conversation.
Photo de la personne + logo CBF SOKO sur chaque notification. Rafraîchissement automatique.

**Messages** : photos de profil dans la liste, l'en-tête et les bulles ; envoi de photos et de vidéos (25 Mo max) en plus des vocaux ;
ouverture directe d'une conversation par `/messages?with=<id>` ; bouton Bloquer.

**Frais** : livraison 2 000 FC fixe (retrait gratuit), commission plateforme 0,5 % partout.

## 3 bis. Ajouts rapides (publication de produit)

- **Prix négociable** : interrupteur à l'étape Détails (« Prix négociable » / « Prix fixe »). Enregistré dans le nouveau champ `Product.negotiable`
  (faux par défaut pour les anciens produits). Affiché sur la fiche produit ; la page « Me renseigner » propose « Quel est votre dernier prix ? »
  seulement si le prix est négociable.
- **Catégorie** : la liste déroulante est remplacée par une fenêtre avec cases à cocher, recherche et bouton Valider (`CategoryPicker.tsx`).
- **Création façon TikTok** : l'étape Médias devient un studio plein écran noir et orange (`VideoStudio.tsx`) :
  caméra 9:16 avec barre de progression, bouton d'enregistrement central, retourner la caméra, minuteur 3 s, durée 60 s / 15 s,
  import depuis la galerie, aperçu en boucle avec « Refaire » / « Utiliser cette vidéo », onglets VIDÉO / PHOTOS.
  Si la caméra est refusée : import d'un fichier ou appareil du téléphone. L'étape Publier montre une carte d'aperçu (couverture vidéo, titre, description).
  Les règles du serveur restent les mêmes : 3 à 7 photos obligatoires, vidéo facultative (80 Mo max, MP4 / MOV / WEBM).
- **Bug corrigé** : cliquer sur « Vente au détail » ou « Vente en gros » envoyait un type que le serveur refusait (erreur 400 à la publication). L'écran envoie maintenant toujours `SALE` ; détail / gros ne sert qu'à limiter la quantité.
- Les écrans de création n'ont plus de bordures ni de halo (même style que les Paramètres).

## 4. Points à connaître (honnêteté)

- **Rien n'a pu être compilé ni testé** : je n'avais ni votre schéma, ni la base, ni les dépendances. La syntaxe de tous les fichiers est
  vérifiée, mais lancez `npm run build` côté backend aussi et testez les parcours (commande, pause, suppression, notifications).
- **Commission : 3 % → 0,5 %** (constante `PLATFORM_COMMISSION_RATE`), **livraison : barème au poids → 2 000 FC fixe**. Les commandes existantes
  sont recalculées avec ces nouvelles valeurs au moment du paiement.
- **Bug existant corrigé** : la quantité et l'adresse saisies sur la fiche produit étaient ignorées par le serveur (commande toujours en quantité 1, sans adresse).
- Les notifications « nouvelle boutique » utilisent le type `PRODUCT` (pour ne pas dépendre de votre schéma) ; elles se distinguent par leur lien `/boutique`.
- Les nouvelles boutiques sont détectées toutes les 2 minutes (aucune route de création de boutique n'est dans le code reçu).
- Le retrait chez le vendeur enregistre le mode et supprime les frais de livraison, mais le circuit livreur / vérification reste le même.
- Masquage d'un compte en pause : jusqu'à 15 secondes de délai (cache des listes de produits et du statut).
- **Non réalisé** (demandent une refonte de l'authentification) : liste des sessions actives, déconnexion de tous les appareils, alertes de connexion, double authentification, langue. Le statut en ligne et le blocage des appels ne sont pas non plus gérés.
- Studio vidéo : l'enregistrement dans le navigateur dépend du navigateur (Chrome, Edge, Firefox, Safari récent) et exige HTTPS. Pas de montage, de filtres ni de musique. Testez sur votre téléphone.
- Anciens écrans conservés tels quels (Messages : quelques bordures d'origine) : seuls les éléments demandés ont été modifiés.
