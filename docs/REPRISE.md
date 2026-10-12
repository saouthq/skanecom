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

## Priorité n° 1 : Atelier Ocre refait en entier (tâche #193)

Le verdict de Skander sur le site du studio (l'aperçu) : « 0,5/10 sur tout le
site, à tous les niveaux » ; la référence, c'est **Resend**, « une belle
identité moderne ». Ses deux choix :

- **Atelier Ocre d'abord.** Le site entier : accueil, réalisations, fiche
  projet, le studio, contact, en-tête, pied. Il devient la référence, puis on
  étend aux autres vitrines.
- **Clair, avec la même rigueur que Resend** : typographie nette, cartes
  bordées, lueurs douces, grille stricte.

**Rien n'est encore écrit dans le code.** L'inventaire est fait, le plan est
arrêté :

### Ce qui ne va pas aujourd'hui
- Le titre d'ouverture fait ~180 px avec −0,045 em d'interlettre : les lettres
  se touchent. Les trois lignes forcées remplissent l'écran, et la photo tombe
  sous la ligne de flottaison (à 1 470 px de large, elle commence à 931 px pour
  une fenêtre de 956 px).
- Les effets : un curseur maison laissé en plein milieu de la page, le rideau
  d'intro, le grain, l'heure en direct, le bandeau géant qui défile, la liste
  en très grande typographie. Une palette beige et des coins droits.

### Le plan
1. **Un nouveau fichier de graines**, par exemple
   `supabase/seed-studio-2026.sql`. L'aperçu ne rejoue une graine qu'une
   fois par nom de fichier : modifier `seed-studio.sql` ne changerait rien en
   ligne. Le nouveau fichier est à ajouter à la liste « installe graines » de
   `apercu.yml`, à ses `paths`, et à la liste de `outils/base-locale.sh`.
   Il met à jour la boutique `…0006` :
   - **Couleurs** : fond `#FCFCFB`, surface `#FFFFFF`, surface_2 `#F6F5F3`,
     filet `#ECEAE6`, filet_fort `#DEDAD3`, contour_champ `#CFCAC2`, encre
     `#121110`, encre_doux `#6B6660`, accent ~`#A0522D`, accent_clair `#E8B48F`.
   - **Style** : coins arrondis, boutons pilule, cartes à cadre, titres amples,
     animations oui (pas « expressives »), allure contemporaine.
   - **Titre d'ouverture** : sur une ligne équilibrée, plutôt que trois lignes
     forcées.
   - Mettre le même style dans `PROPRE_A.studio` (le style recommandé de la
     structure). On garde instrument-sans : Inter demanderait une migration de
     la liste des polices.
2. **La typographie** : h1 `clamp(2.75rem, 5.6vw, 5rem)`, graisse ~560,
   −0,035 em, interligne ~1,02, équilibré, centré, ~16 ch au plus. h2
   `clamp(2rem, 3.6vw, 3.25rem)`. Texte courant de 16 à 18 px, en ton doux.
3. **L'ouverture** :
   - une pastille avec un point d'accent au-dessus du titre ;
   - le chapo, puis deux boutons : « Voir les réalisations » (pilule sombre)
     et « Parlons de votre projet » (bordé, vers /contact) ;
   - dessous, la photo dans une carte : rayon ~20 px, filet de 1 px, 8 px de
     marge intérieure, grande ombre douce, lueur chaude, trame discrète
     estompée sur les bords ;
   - plus d'heure en direct.
4. **Les sections** :
   - **Manifeste** : centré, ~32 px, sans dévoilement mot à mot.
   - **Réalisations** : un rang de tête avec son lien, puis une grille de 3, 2
     ou 1 colonnes de cartes bordées (photo 4/3, nom 17 px/600, ligne en ton
     doux, légère levée et flèche au survol, sans décalage d'apparition).
   - **Domaines** : des tuiles, à la place du bandeau qui défile et de la liste
     géante.
   - **Services** : la tête et la photo à gauche, quatre cartes bordées en 2×2
     à droite, avec leur numéro en pastille.
   - **Méthode** : quatre colonnes, numéros en pastille et un trait qui les
     relie, sans défilement horizontal épinglé.
   - **Récit** : une carte bordée, la photo et le texte.
   - **Contact** : un cadre clair arrondi avec une lueur chaude ; le
     formulaire dans une carte blanche bordée ; les contacts directs en
     rangs, chacun avec son icône dans un carré.
5. **L'en-tête** : collant, blanc à 80 % avec flou, un filet en bas, 64 px. Le
   nom en logotype (peut-être une arche), une navigation en 14 px/500 avec une
   pastille au survol, un petit bouton sombre (sans `Roule` ni aimant).
   **Le pied** : un filet, des colonnes, un petit texte en ton doux. Le nom
   géant (`MarqueGeante`) est retiré ou atténué pour le studio.
6. **Les autres pages** :
   - **La liste des projets** : h1 modéré, filtres en pastilles, les mêmes
     cartes.
   - **La fiche projet** : le fil d'Ariane, le domaine en pastille, h1
     ~4 rem, les faits dans une barre bordée, la photo d'ouverture arrondie,
     le texte avec une carte collante à côté, la galerie arrondie, « Projet
     suivant » en carte. Retirer `data-rideau` et `data-curseur`.
7. **Retirer pour le studio** : `IntroStudio` et `SCRIPT_INTRO`, ainsi que
   `MouvementStudio` (le curseur, le rideau, le défilement doux, l'en-tête qui
   se cache). Retirer aussi le grain, la barre de progression, le bandeau et
   le CSS lié au défilement « expressif ». Supprimer les composants qui ne
   servent plus ailleurs.
8. **Garder intactes** les règles communes `.vi-*` des autres structures : on
   ne restyle que sous `html[data-structure="studio"]` et `.st-*`.

### Les fichiers concernés
- `application/src/app/studio.css` (658 lignes) ;
- `application/src/components/AccueilStudio.tsx`, `Projets.tsx`,
  `SectionsVitrine.tsx` ;
- l'en-tête et le pied : `Entete.tsx` (branche studio) et `Pied.tsx`
  (`PiedEditorial`) ;
- `app/%5Fb/[boutique]/layout.tsx` (l'intro, `MouvementStudio`) ;
- les styles de base de l'en-tête et du pied : `editorial.css`,
  `contenus.css`, `socle.css`.

### Vérifier
- Captures avant et après :
  `node docs/reprise/outils-essai/studio-avant.mjs apres` (1 470, 1 280,
  1 000 et 390 px ; les captures vont dans `$ESSAIS/studio-captures/`).
  L'« avant » se refait d'abord sur le site tel qu'il est
  (`… studio-avant.mjs avant`).
- Toutes les pages à la souris, au clavier et au téléphone.
- Puis pgTAP et le parcours. `essai-vitrine.sh` vérifie
  `data-structure="studio"`, l'absence de TND et `/produit/villa-gammarth`.
- Commit `[complet]`, push.

## Ensuite : M6 puis M4 (tâche #192), prêts à poser

Les deux lots sont écrits et essayés sur une copie du dépôt, posés l'un après
l'autre sur `00bb798` (dans cet ordre : M4 s'accroche à des lignes que M6
ajoute). Ils sont gardés dans `docs/reprise/` :

- **M6 — le diagnostic d'une boutique et les fiches réflexes.**
  - Un onglet « Diagnostic » sur la fiche : la vitrine essayée à l'instant,
    puis son statut, ses erreurs, ses e-mails, son catalogue, sa livraison,
    son paiement, ses commandes. Ce qui bloque passe en tête, avec quoi faire.
  - Dans l'État technique : les fiches réflexes (symptôme, puis le geste qui
    répond).
  - Migration `…120900_diagnostic`, pgTAP 126.
- **M4 — les fournisseurs.** Konnect, Resend, SkanFact, etc. essayés depuis
  l'État technique, et chaque heure. Migration `…121000_fournisseurs`,
  pgTAP 127.

Poser :

```sh
python3 docs/reprise/m6/appliquer.py
docs/reprise/outils-essai/relance-vitrine.sh --build
node docs/reprise/outils-essai/verif-m6.mjs   # captures dans $ESSAIS/m3m6-captures
# pgTAP, parcours de la console, puis commit avec docs/reprise/m6/commit.txt, push
python3 docs/reprise/m4/appliquer.py
# même chose avec verif-m4.mjs et docs/reprise/m4/commit.txt
```

Deux pièges déjà corrigés dans les scripts, à ne pas réintroduire : le jeton
`--ui-texte-doux` n'existe pas dans la console (c'est `--ui-texte-3`), et la
colonne s'écrit `publie_le`, pas `publiee_le`.

**M7 (le trafic)** attend une clé Cloudflare en lecture seule, que Skander
pose lui-même dans les secrets (jamais collée dans la conversation).

## Ce qui attend Skander

- Les conditions de service v1, relues par un avocat.
- Allumer les alertes de la surveillance, avec les adresses de destination.
- La clé Cloudflare en lecture seule (M7).
- Les sauvegardes Supabase.
- Les comptes de production : SMS, Resend, Turnstile, les prix des formules…

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
