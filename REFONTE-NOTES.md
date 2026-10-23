# CBF SOKO — notes de livraison frontend

## Changements inclus
- Mise en place d'une base de styles globaux accessible et responsive, en conservant l'orange et le vert de la marque.
- Fond blanc par défaut et prise en compte des préférences d'arrière-plan déjà choisies, avec migration des anciennes valeurs sombres par défaut.
- Fiche produit élargie et réorganisée pour les grands écrans : galerie et informations d'achat en colonnes sur desktop, colonne unique sur mobile.
- Ajout d'une page 404 dédiée ; les URL inconnues ne redirigent plus silencieusement vers l'accueil.
- Ajout d'un preset de fond « Blanc classique » dans les paramètres.

## Préserver le fonctionnement
- Les routes existantes et les appels API métier ont été conservés.
- Aucun jeu de données fictif ni nouvelle API financière n'a été ajouté.
- Les préférences de thème personnalisées autres que les anciennes valeurs sombres par défaut sont conservées.

## Lancement
1. Copier `.env.example` vers `.env` et régler `VITE_API_URL` vers l'API réelle.
2. Installer les dépendances : `npm ci`.
3. Démarrer : `npm run dev`.
4. Construire : `npm run build`.

Le build n'a pas pu être validé dans l'environnement de préparation : l'installation des dépendances a expiré et TypeScript signalait des définitions de types incomplètes dans `node_modules`. Refaire `npm ci` dans un environnement disposant d'un accès npm avant déploiement.
