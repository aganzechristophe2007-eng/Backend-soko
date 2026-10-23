# CBF SOKO — notes de refonte frontend

## Changements appliqués
- Ajout d'une couche de design partagée (`src/design-system.css`) : contours, surfaces, cartes, formulaires, focus clavier, animations et adaptations mobiles harmonisés.
- Import du système de design dans `src/main.tsx`, sans modifier les routes ou les appels API.
- Refonte visuelle du panneau de connexion/inscription dans `src/pages/Authsheet.tsx` : champs plus lisibles, boutons cohérents avec la marque, bordures et ombres allégées.
- Ajustement de la mise en page de connexion dans `src/pages/Login.tsx` pour éviter une hauteur fixe qui peut couper le contenu sur les petits écrans.
- Remplacement de la page « À propos » provisoire par une présentation de CBF SOKO dans `src/pages/About.tsx`.

## Vérifications
- `node node_modules/typescript/bin/tsc -b` : réussi.
- Le build Vite n'a pas pu être terminé dans cet environnement : l'archive fournie contient des dépendances `node_modules` destinées à Windows, mais le paquet natif Rollup Linux requis est absent. Le téléchargement de cette dépendance a dépassé le délai disponible.
- Aucun test navigateur ou test E2E n'a été exécuté ici.

## Installation et vérification sur une machine de développement
Dans le dossier du frontend, exécuter `npm ci`, puis `npm run build`. Si le projet compile, vérifier les parcours de connexion/inscription, publication, détails produit, commandes, messagerie, notifications et portefeuille sur mobile et ordinateur.
