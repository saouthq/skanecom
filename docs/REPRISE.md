# Reprise — où on s'est arrêté (12/10/2026, soir)

Note de passage entre deux séances. À lire en premier, puis à effacer (avec
`docs/reprise/`) quand tout ce qui suit est posé.

## Où en est le dépôt

- Branche `claude/gallant-hawking-gi9xv0`. Derniers lots poussés, vérifiés en
  captures (souris, clavier, téléphone), pgTAP et parcours de la console verts :
  - **L4** — les erreurs de l'application, boutique par boutique (`b2ea23f`) ;
  - **M5** — le dépannage : maintenance d'une vitrine ou de toutes, cache vidé,
    files relancées (`4d14137`) ;
  - **M2** — la version en ligne et la chronologie (`0ff82a0`) ;
  - **M3** — les tâches de fond : le passage de l'heure vide les files d'envoi
    (`00bb798`).
- **Réparé ce soir** : depuis M2, `.github/workflows/apercu.yml` ne se lisait
  plus (un saut de ligne écrit en clair dans le `printf` de l'étape « Compiler
  l'application »). L'aperçu en ligne ne s'est donc pas redéployé pour M2 et
  M3. Le commit de cette note le répare : vérifier au début de la prochaine
  séance que « Aperçu en ligne » est vert et que l'État technique de l'aperçu
  montre la version (M2) et les tâches de fond (M3).

## Fait le 06/11 : Atelier Ocre refait en entier (tâche #193)

L'identité claire et tenue demandée par Skander (« comme Resend ») : voir la
feuille de route, section E, « Le Studio refait ». Vérifié au navigateur (souris,
clavier, téléphone, 1 440 / 1 280 / 1 000 / 768 / 390 px, une demande envoyée
pour de vrai), pgTAP, essai de la vitrine.

Puis les cinq autres vitrines relues avec la même rigueur (accueil, catalogue,
fiche, panier, recherche, compte, pages légales, page introuvable ; 1 440 et
390 px) : le vide en trop avant le pied (Dar Alia, Yasmine), le double filet
de Selma, ses flèches de rangée sans rien à faire défiler, la case vide de la
Quincaillerie, le bouton de recherche hors de l'axe, le survol qui restait
collé à un bouton touché au téléphone. Le reste tient ; le vrai manque est
ailleurs : les photos de Maymar (« Photo à venir »), à refaire selon le
protocole.

## Fait le 06/11 : M6, M4 et M7 (le poste de contrôle)

- **M6** — le diagnostic d'une boutique (sa fiche → Diagnostic) et les fiches
  réflexes de l'État technique.
- **M4** — les fournisseurs essayés chaque heure (une clé Resend « envoi
  seul » est reconnue comme bonne).
- **M7** — le trafic : lu chez Cloudflare avec la clé en lecture de Skander
  (`CLOUDFLARE_LECTURE`, transmise au Worker de l'aperçu sous
  `CLOUDFLARE_TRAFIC`). **Vérifié en ligne le 07/11 à 01:17 UTC** : lecture
  réussie, 209 heures-Worker sur 25 heures (9 Workers), 2 614 requêtes de
  l'application, 0 erreur. Le relevé tourne à la 17e minute de chaque heure
  (à l'heure pile, l'API des analyses ne répondait pas en dix secondes) ; le
  workflow de l'aperçu mesure aussi la lecture à chaque déploiement.

- **Turnstile** — l'anti-robots devant le formulaire de contact et les codes
  par SMS, coupé tant que les clés ne sont pas posées.
- **La vitrine attend la base quatre secondes** (deux avant) : une lecture lente
  au réveil de l'heure ne casse plus une page.

Les outils d'essai restent dans `docs/reprise/outils-essai/` (relance,
captures, vérifications au navigateur).

## Fait le 07/11 : le parcours entier, joué en utilisateur

Une boutique neuve (« Nour Maroquinerie ») créée dans la console, sa gérante
invitée par e-mail qui la configure seule (identité légale, contact, deux
produits avec déclinaisons, photos, stock, livraison, éditeur), l'ouverture,
puis deux clientes (téléphone au doigt, ordinateur au clavier seul), une
commande livrée, une refusée à la remise (stock rendu), un avis relu et publié.
Corrigé : la case des conditions au doigt, le curseur de la recherche, le
conseil WhatsApp sur toutes les fiches (message prérempli), l'ouverture sans
photo, les saisies perdues au backoffice, la photo retirée sans question, le
lien proposé après chaque geste sur une commande.

Tranché par Skander le 07/11 :

- **L'aperçu avant l'ouverture** : voulu ainsi — une boutique sans contenu ne
  donnerait pas envie ; on l'ouvre une fois garnie.
- **Le logo** : le commerçant le pose lui-même (fait le 07/11 : éditeur de la
  vitrine → En-tête et pied → Logo, avec le monogramme et l'icône d'onglet ;
  migration …_logo_commercant, pgTAP 130).

Petits points restants : la référence tirée du nom (« PORTEFEUILLE-HOMME-EN-CU »)
paraît dans les suggestions de recherche ; « Les nouveautés » et « La sélection »
montrent les mêmes pièces sur un tout petit catalogue ; en style « contour », le
bouton final « Confirmer la commande » n'est qu'un cadre.

## Fait le 07/11 (après-midi) : d'autres parcours joués en vrai

Neuf lots, chacun vérifié au navigateur (souris, clavier, téléphone, captures)
et par les parcours automatiques : la cliente de Selma (filtres, panier, code
promo, commande), l'artisan de la Quincaillerie (comparer, retrait, facture
société, quantité tapée, devis), le devis des deux côtés, l'équipe (une
employée invitée, ses appels), le retour en stock, le paiement en ligne,
la suspension d'une boutique, le service après-vente, la commande en
invité. Le détail : feuille de
route, section E, « D'autres parcours, joués en vrai ».

Remarqué, laissé tel quel :

- Sur « Tout le catalogue » d'une boutique qui mêle les rayons, « Pointure »
  passe avant « Taille » (l'ordre des axes, alphabétique à égalité).
- Au backoffice, une page chargée directement (`?stock=…`) n'a pas le focus
  automatique sur la quantité ; venu par le lien du réassort, il y est.
- La page de bienvenue d'une invitation ne nomme pas la boutique (l'e-mail,
  si).
- « Panier (250) » compte les pièces, même pour 250 vis.
- Le bandeau d'une boutique suspendue dit « appelez-nous » (le message de la
  console), sans moyen de joindre SkanEcom : il faudra le numéro du support.

## Ce qui attend Skander

- Les conditions de service v1, relues par un avocat.
- Allumer les alertes de la surveillance, avec les adresses de destination.
- Les sauvegardes Supabase.
- Les comptes de production : SMS, Resend, Turnstile, les prix des formules…
- Turnstile : créer le widget chez Cloudflare, y déclarer le domaine de chaque
  boutique, poser les deux secrets.

## Plus loin (déjà notées)

- F1 à F6 (témoignages, avant/après, accusé de réception, rendez-vous, pièces
  jointes, vidéo d'ouverture).
- La refonte premium des vitrines (#67).
- Le mouvement de la console et du backoffice (#70).
- Le gabarit « commerce » (#71).
- Les polices arabes (#78).
- La mise en production (#168).
- Maymar en 2026 (#171).

## Rappels de méthode

- Chaque correction se vérifie comme un humain, à la souris, au clavier et au
  téléphone, **avec des captures**. On corrige et on pousse lot par lot.
- `application/src/annuaire.genere.json` reste `{}` à chaque commit.
- Les boutiques de démonstration n'affichent ni vraie marque, ni chiffre, ni
  prix, ni témoignage inventés.
- `workers.dev` est refusé par le proxy de la session : l'aperçu ne s'ouvre
  pas d'ici, on essaie en local (`studio.localhost:4200`,
  `console.localhost:4200`).
