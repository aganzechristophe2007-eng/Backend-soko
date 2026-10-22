# Modernisation du design — pages CBFSOKO

Style de référence : `Home.tsx` (inchangé).

Jeu de tokens Tailwind utilisé partout (valeurs arbitrairement typées, aucune config nécessaire) :
- Fond : `bg-white` / `bg-[#F9FAFB]` / `bg-[#F2F4F7]`
- Bordures : `border-[#EAECF0]` (fort : `border-[#D0D5DD]`)
- Texte : `text-[#111111]`, secondaire `text-[#344054]`, discret `text-[#667085]` / `text-[#98A2B3]`
- Accent : `#FF6B00` (survol `#E85F00`, fond doux `#FFF1E7`)
- Cartes : `rounded-2xl border border-[#EAECF0] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)]`
- En-têtes : `sticky top-0 border-b border-[#EAECF0] bg-white/95 backdrop-blur`

Aucun fichier de style supplémentaire n'est nécessaire : tout passe par les classes Tailwind déjà utilisées dans Home.
