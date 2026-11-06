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
pour de vrai), pgTAP, essai de la vitrine. Il reste à l'étendre aux autres
vitrines (même rigueur, chacune son caractère).

## Maintenant : M6 puis M4 (tâche #192), prêts à poser

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

**M7 (le trafic)** : la clé est posée — secret GitHub `CLOUDFLARE_LECTURE`
(jeton « skanecom-lecture-trafic », Account Analytics: Read, sans expiration,
posé par Skander le 13/10). Reste à la transmettre au Worker dans `apercu.yml`
et à construire l'écran.

## Ce qui attend Skander

- Les conditions de service v1, relues par un avocat.
- Allumer les alertes de la surveillance, avec les adresses de destination.
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
