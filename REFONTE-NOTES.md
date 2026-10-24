# CBF SOKO — refonte du design (23-24 oct. 2026)

## Ce qui a changé
- Navigation globale `src/components/AppShell.tsx` : barre latérale à gauche sur ordinateur (style Instagram), barre du bas fine sur mobile (Accueil, Commandes, Publier, Messages, Profil). Aucune route ajoutée.
- Mode clair / sombre / système : `src/lib/themeMode.ts`, bouton dans la barre latérale et section « Apparence » dans Paramètres. Les couleurs sombres sont gérées une seule fois dans `src/design-system.css`.
- Pages retravaillées : Accueil, fiche produit, profil vendeur, publication, commandes, messages, notifications, portefeuille, admin, paramètres, connexion/inscription, boutiques, à propos.
- Bugs corrigés : onglet Profil / lien `/profile` (route inexistante) → `/settings` et `/users/:id`; `Register.tsx` appelait `localhost:5000` en dur; textes blancs sur fond blanc (CreateProduct, Orders, Settings, admin).

## À faire de ton côté
`npm install` puis `npm run build` (la refonte a été écrite sans pouvoir lancer le build : seule la syntaxe a été vérifiée), puis tester mobile + ordinateur, clair + sombre.
