# Directive permanente — design, UI/UX, motion et frontend

> Donnée par Skander le 30/09/2026. **Partie permanente du cahier des charges**, au même rang que le PRD ([`01-prd.md`](01-prd.md)) : le PRD définit le produit, ses fonctionnalités, ses utilisateurs et ses contraintes métier ; cette directive définit le niveau de qualité de l'interface, de l'expérience, du mouvement et du code frontend. **Les deux se respectent ensemble** : on ne change pas le métier pour rendre l'interface plus jolie, on cherche toujours la meilleure manière de présenter le métier.
>
> Le niveau attendu n'est pas « ça fonctionne ». C'est : **« c'est tellement bien conçu qu'on remarque immédiatement la qualité. »**

## 1. Le standard

Une interface fonctionnelle, propre, responsive, moderne, cohérente, jolie : **ce niveau est insuffisant.** La référence est celle des meilleurs produits SaaS, des meilleurs sites e-commerce premium et des meilleurs studios digitaux d'aujourd'hui. Chaque écran doit sembler conçu par une équipe complète : product designer, UI designer, UX designer, motion designer, ingénieur frontend, ingénieur du design system.

La question à se poser devant chaque écran : **« Est-ce que cette interface ressemble à un produit premium réellement commercialisable en 2026 ? »** Si non, on continue.

## 2. Concevoir des compositions, pas des pages

Ne plus penser « en-tête → titre → cartes → tableau → boutons → pied ». Penser : hiérarchie visuelle, intention de l'utilisateur, rythme, densité d'information, composition dans l'espace, interaction, retour, transitions, micro-interactions, états, contexte, priorité visuelle. **Chaque écran a une composition.**

## 3. Règle absolue : pas d'air de gabarit

À éviter en particulier :

- le tableau de bord générique à quatre grosses cartes en tête ;
- les cartes « icône + titre + chiffre » partout ;
- les énormes boutons arrondis, le verre dépoli gratuit, les dégradés violet-bleu génériques, les ombres excessives, les bordures partout ;
- les tableaux froids et datés, la barre latérale énorme, les en-têtes surdimensionnés ;
- des boutons « Ajouter » partout, des fenêtres modales énormes par défaut, des pastilles colorées partout ;
- les espaces vides artificiels, la répétition de composants identiques ;
- l'allure Bootstrap / Material par défaut, des composants de bibliothèque utilisés sans personnalisation ;
- l'« interface d'administration des années 2020 ».

Les composants existants peuvent servir de primitives techniques ; leur apparence est celle du produit.

## 4. Le design system avant la multiplication des écrans

Un vrai langage visuel, défini avant d'ajouter des écrans :

- **Typographie** : display, titre, sous-titre, texte, légende, métadonnées, chiffres, étiquettes, navigation — tailles, graisses, interlignage et approche cohérents.
- **Couleurs** : fond, surface, surface élevée, bordure, texte principal, texte secondaire, atténué, accent, succès, attention, danger, information — employées avec retenue.
- **Espacement** : une échelle, jamais « 17 px ici, 23 px là, 31 px ailleurs ».
- **Rayons** : une logique ; certains éléments très discrets, pas « 16 px partout ».
- **Ombres** : rares et maîtrisées. Le premium vient de la profondeur, du contraste, de l'espace, de la typographie et de bordures subtiles, plus que des ombres.

## 5. Des composants de produit

Chaque composant est conçu comme un vrai composant de produit — bouton, champ, liste déroulante, menu, infobulle, popover, dialogue, tiroir, tableau, grille de données, onglets, pastille, carte, navigation, recherche, palette de commandes, notification, état vide, chargement, erreur, carte produit, galerie, sélecteur de déclinaison, panier, commande, statut de commande… — avec ses états **par défaut, survol, actif, focus, désactivé, chargement, erreur, succès** quand ils ont un sens.

## 6. Micro-interactions

Beaucoup plus de finesse : un bouton change subtilement au survol, répond physiquement à la pression, confirme un succès ; la recherche s'adapte au focus ; le panier répond immédiatement à l'ajout ; un changement de statut s'anime légèrement ; une zone de dépôt réagit au glisser ; une ligne de tableau reste lisible au survol ; la navigation est fluide. **Rapide et naturel.**

## 7. Le mouvement fait partie du design system

CSS, transitions, Motion (Framer Motion), GSAP et ScrollTrigger, FLIP, animations de mise en page, SVG, Lottie, Canvas, WebGL / Three.js **quand c'est réellement pertinent**. Pas d'animation pour faire joli : chacune guide, explique, confirme, hiérarchise, oriente, crée une continuité ou donne un retour.

## 8. Principe : le mouvement est une information

Une animation fait comprendre ce qui vient de se passer : l'article ajouté rejoint visiblement le panier ; un panneau qui paraît garde un lien avec ce qui l'a ouvert ; une navigation donne un sentiment de continuité ; un changement d'état se perçoit. Mouvements **courts, naturels, précis, fluides, intentionnels**.

## 9. E-commerce premium

La vitrine est essentielle (PRD : personnalisable, mobile d'abord, FR/AR, catalogue, recherche, filtres, produit, panier, commande à la livraison). Pas de boutique générique : elle doit pouvoir passer pour **le site officiel d'une vraie grande marque**.

## 10. L'accueil d'une boutique

Pas « bannière → trois catégories → produits → témoignages → pied », mais une vraie composition éditoriale, selon la marque : ouverture immersive, grands visuels, récit autour du produit, catégories éditoriales, meilleures ventes, nouveautés, collections, preuves de confiance, avantages, informations de livraison, contenu de marque. **La structure change selon le thème.**

## 11. La fiche produit

Photos, galerie, zoom, déclinaisons, prix, ancien prix, stock, caractéristiques, quantité, ajout au panier, livraison, retrait en magasin, informations importantes — et surtout une **hiérarchie excellente**. Le client comprend immédiatement : 1. qu'est-ce que c'est ; 2. combien ça coûte ; 3. est-ce disponible ; 4. quelle déclinaison choisir ; 5. quand vais-je le recevoir ; 6. comment l'acheter.

## 12. Les catalogues techniques

Le thème des distributeurs et quincailleries n'est pas une boutique avec un autre logo : c'est un **outil de recherche produit** (grands catalogues, recherche rapide, filtres par attribut, fiches techniques, références, retrait en magasin, prix professionnels). Recherche par référence, filtres rapides, attributs techniques, comparaison visuelle, disponibilité, conditionnement, dimensions, puissance, tension, compatibilité : **une information dense mais extrêmement lisible.**

## 13. Le backoffice

Un vrai logiciel professionnel, pas une suite de pages de saisie : catalogue, déclinaisons, stock, commandes à la livraison, clients, livreurs, équipe, rôles, exports, fiches techniques, prix professionnels. **Chaque écran est conçu autour du travail réel** de celui qui l'utilise.

## 14. Les tableaux

Des tableaux modernes : bonne densité, colonnes pertinentes, hiérarchie, actions contextuelles, recherche, filtres, tri, sélection, pagination, états, retours. Pas quinze boutons par ligne : **les actions paraissent au bon moment.**

## 15. Le tableau de bord

Pas les quatre grosses cartes « Commandes / Clients / Produits / Chiffre d'affaires ». Il répond à : **« Qu'est-ce que l'utilisateur doit savoir maintenant ? »**, puis **« Qu'est-ce qu'il doit faire maintenant ? »** — et sa hiérarchie en découle.

## 16. La console SkanEcom

Utilisée par Skander et son père pour installer et suivre les boutiques (création, marque, modules, équipes, import du catalogue, mise en place) : un **outil SaaS premium d'orchestration**, pas un vieux panneau d'administration. Philosophie : boutique → identité → configuration → catalogue → intégrations → domaine → essais → mise en ligne. **L'état de chaque boutique se comprend immédiatement.**

## 17. États vides

Jamais « rien ici ». Dire pourquoi, proposer l'action principale (par exemple l'import Excel/CSV d'un catalogue vide) — sobrement.

## 18. Chargements

Pas de simple « Chargement… » : squelettes, chargement progressif, transitions, retours. Le chargement fait partie de l'expérience.

## 19. Erreurs

Pas « Erreur 500 », mais : ce qui s'est passé, ce que ça change, ce que l'utilisateur peut faire, et le bouton pour le faire.

## 20. Formulaires

Jamais trente champs d'un coup : regroupement logique, sections, dévoilement progressif, validation en ligne, aide contextuelle, valeurs par défaut, retour immédiat.

## 21. Téléphone

Le mobile d'abord n'est pas « l'ordinateur réduit à 375 px » : navigation adaptée, actions prioritaires, feuilles montantes et tiroirs quand c'est pertinent, actions collantes, gestes naturels, contenu hiérarchisé. **Le backoffice aussi** (PRD).

## 22. Français, arabe, droite-à-gauche

Le RTL se conçoit dès le départ : mise en page, navigation, icônes directionnelles, tableaux, formulaires, tiroirs, animations, alignements, menus, graphiques fonctionnent en LTR **et** en RTL.

## 23. Accessibilité

Jamais le premium au détriment de l'utilisateur : contraste, clavier, focus, lecteurs d'écran, mouvement réduit, taille des zones à toucher.

## 24. Performance

Avant Three.js, WebGL, GSAP ou Canvas : « est-ce que ça améliore réellement l'expérience ? ». Sinon, plus léger. Une interface **exceptionnelle et rapide**.

## 25. Un seul moteur

Un seul code et une seule base pour tous les clients (PRD). Pas de `MaymarHomepage.tsx` ni de `QuincaillerieHomepage.tsx` qui dupliquent le produit : des thèmes, des jetons de design, des sections, des modules, des réglages. Le moteur reste commun.

## 26. Des thèmes qui font une identité

Un thème ne change pas seulement une couleur : typographie, couleurs, espacements, rayons, boutons, cartes, navigation, ouverture, sections, densité, cartes produit, pied de page, iconographie, animations. Deux boutiques ont une **vraie identité différente** sur le même moteur.

## 27. Pas de cartes partout

Une carte seulement quand elle apporte une séparation ou une hiérarchie utile. Aussi : l'espace, les filets, la typographie, les images, les sections, les surfaces, les groupes, la composition ouverte.

## 28. Icônes

Une icône a une fonction ; pas une icône devant chaque titre parce qu'elle existe.

## 29. Contenu

Jamais de faux chiffres, témoignages, clients, certifications ou statistiques. Si l'information n'existe pas : **une structure propre pour recevoir la vraie donnée.**

## 30. Revue de design obligatoire

Avant de dire un écran terminé :

- **UI** — premium ? moderne ? cohérent ? assez travaillé ?
- **UX** — comprend-on immédiatement quoi faire ? l'action principale est-elle évidente ? trop d'informations ? des étapes inutiles ?
- **Mouvement** — fluide ? des transitions qui ont un sens ? trop d'animations ?
- **Écrans** — ordinateur, portable, tablette, téléphone.
- **Sens de lecture** — LTR, RTL.
- **Accessibilité** — clavier, focus, contraste, mouvement réduit.
- **Performance** — rendus inutiles, images, animations, WebGL, poids du code livré.

## 31. Autocritique

Pas « la page fonctionne » mais : « pourrait-on la montrer à un client qui paie plusieurs milliers de dinars ? », « semble-t-elle conçue par un designer senior ? », « qu'est-ce qui donne encore une impression de gabarit ou de génération automatique ? » — et corriger ces éléments.

## 32. Références de niveau

Apple, Stripe, Linear, Vercel, Raycast, Arc, Notion, Shopify, Framer, les meilleurs SaaS, les meilleurs sites e-commerce premium, les meilleurs studios, Awwwards, FWA — **pour comprendre le niveau** de finition, de typographie, d'interaction, de mouvement, de hiérarchie et de précision. **Ne rien copier.**

## 33. Premium

Pas plus de couleurs, d'animations, de 3D, de dégradés, d'effets : **moins de bruit, une meilleure composition, une meilleure typographie, de meilleurs détails, de meilleures interactions.**

## 34. « Wow »

Régulièrement, de petits moments « ah, c'est bien fait » : une transition parfaitement synchronisée, un survol subtil, une fiche produit magnifique, une recherche intelligente, un panier fluide, une animation d'ajout, un changement de page élégant, une navigation très bien pensée, un état vide particulièrement réussi. Le spectaculaire est réservé aux bons moments.

## 35. Apprendre de ses erreurs

Quand une interface est jugée ratée, on ne change pas trois couleurs : on cherche **pourquoi** (hiérarchie, espacement, rapport texte/image, composants génériques, trop de cartes, typographie, contraste, rythme, surcharge, interactions absentes, téléphone, densité, animation absente ou inutile) et on corrige la cause.

## 36. Ne pas sur-designer

Savoir quand ne pas animer, ne pas ajouter de carte, ne pas ajouter de couleur, laisser du vide. **La sophistication vient de la retenue.**

## 37. La mission

Continuer le développement existant, sans recommencer inutilement : analyser les interfaces déjà construites, repérer ce qui paraît daté, générique, amateur, gabarit, trop administratif ou peu intuitif ; en tirer une liste de corrections prioritaires ; puis améliorer progressivement le design system et les interfaces — **pas une refonte cosmétique**, une amélioration réelle de l'interface, de l'expérience, du mouvement, des interactions, du téléphone, de l'architecture des composants et du design system.
