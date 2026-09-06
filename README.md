# Planning médecin SOMNUM

## Contenu du projet
- `index.html` — le portail présence médecin, accessible directement (pas de page d'accueil intermédiaire)
- `style.css` — styles
- `app.js` — toute la logique (grille, médecins, sites, export PDF, stats)
- `config.js` — connexion à Supabase (déjà rempli avec votre projet)
- `logo.png` — votre logo Somnum, déjà intégré dans l'en-tête

## Codes d'accès

Deux codes protègent maintenant l'application :
- **Code de la page** : demandé à l'ouverture, pour tout le monde. Par défaut `SOMNUM2026`.
- **Code admin** : demandé uniquement quand on active "Vue admin". Par défaut `ADMIN2026`.

Pour les changer, ouvrez `config.js` et modifiez les deux lignes `PAGE_ACCESS_CODE` et `ADMIN_ACCESS_CODE`.

**Important — ce que ces codes protègent et ce qu'ils ne protègent pas** : ce sont des codes stockés en clair dans le code de la page, pas une vraie authentification. N'importe qui sachant regarder le "code source" de la page (clic droit → "afficher le code source", ou les outils développeur d'un navigateur) peut les lire directement. C'est suffisant pour empêcher un accès accidentel ou par curiosité, mais **pas pour protéger des données sensibles contre quelqu'un de déterminé**. Pour une vraie sécurité, il faudrait un système d'authentification côté serveur (via Supabase Auth par exemple) — n'hésitez pas à en discuter avec Skywork si c'est nécessaire pour vous.

## Avant de mettre en ligne

1. **Lien Somnum RH** : ouvrez `index.html`, cherchez `VOTRE-LIEN-SOMNUM-RH.example.com` et remplacez-le par la vraie adresse de votre application existante (bouton "Somnum RH" en haut à droite de l'en-tête).

## Mettre le site en ligne (Netlify, sans GitHub)

1. Allez sur [netlify.com](https://netlify.com) et créez un compte gratuit.
2. Une fois connecté, cherchez la zone "Deploy manually" / glisser-déposer.
3. Faites glisser le dossier entier `portail-medecin` dans la zone.
4. Netlify vous donne une adresse (ex : `nom-genere.netlify.app`) — votre site est en ligne.

## Mettre le site en ligne (avec GitHub, mise à jour automatique)

1. Créez un dépôt sur [github.com](https://github.com) (ex : `portail-medecin`).
2. Déposez-y tous les fichiers de ce dossier.
3. Sur Netlify ou Vercel, choisissez "Importer depuis GitHub" et sélectionnez ce dépôt.
4. Chaque futur changement poussé sur GitHub republie automatiquement le site.

## Fonctionnement du mode admin

Le bouton "Vue admin" demande désormais le code admin défini dans `config.js` avant de montrer les onglets "Médecins" et "Sites". Voir la section "Codes d'accès" ci-dessus pour les limites de cette protection.
