# Tester SkanEcom soi-même

Trois boutiques de démonstration tournent avec la même application, chacune avec son gabarit :

| Adresse | Boutique | Gabarit |
|---|---|---|
| http://mode.localhost:4200 | Maison Selma — prêt-à-porter | éditorial |
| http://maymar.localhost:4200 | Maymar — bagages | éditorial |
| http://quincaillerie.localhost:4200 | Quincaillerie du Sud — outillage | technique |
| http://console.localhost:4200 | la console de mise en place | — |

Tout tourne sur ta machine : une base Postgres, l'API (PostgREST et GoTrue, comme chez Supabase) et la vitrine compilée pour Cloudflare Workers. Rien n'est ouvert au réseau : la vitrine n'écoute que sur `127.0.0.1`.

Les photos des boutiques sont des photos de démonstration libres de droits (`supabase/fichiers-demo/CREDITS.md`) : elles restent jusqu'à la fin du développement. Les produits de Maymar affichent « photo à venir » en attendant ses vraies photos.

## 1. Installer, une seule fois

Il faut **Linux** (Ubuntu 24.04 ou Debian 12) sur un processeur **x86_64**, ou **Windows avec WSL2**. Sur Mac, pas encore : deux outils téléchargés (PostgREST, GoTrue) sont compilés pour Linux.

**Windows** : dans PowerShell ouvert en administrateur, `wsl --install -d Ubuntu-24.04`, redémarrer, ouvrir « Ubuntu » dans le menu Démarrer, puis continuer ci-dessous dans ce terminal.

Dans le terminal (Ubuntu, Debian ou WSL) :

```bash
# Postgres 16 avec pgTAP (et pg_prove pour les tests), et les petits outils
sudo apt update
sudo apt install -y postgresql-16 postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl curl unzip xz-utils git

# Node 22 (par nvm), puis Bun
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 22
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

Sur Debian 12, `postgresql-16` vient du dépôt de Postgres (apt.postgresql.org) : suivre la page « Linux downloads (Debian) » de postgresql.org, puis la même commande `apt install`.

## 2. Lancer

```bash
git clone https://github.com/saouthq/skanecom.git
cd skanecom
git checkout claude/gallant-hawking-gi9xv0
outils/essayer.sh
```

`outils/essayer.sh` vérifie d'abord les prérequis (et dit quoi installer s'il en manque un), recrée la base avec le jeu de démo, démarre l'API, compile la vitrine puis la lance. Compter quelques minutes la première fois : il télécharge PostgREST, GoTrue (empreintes vérifiées) et les dépendances de l'application. Quand il affiche les quatre adresses, les ouvrir dans **Chrome, Firefox ou Edge** (ils savent que `*.localhost` est ta machine).

- **Windows (WSL)** : ouvrir les adresses dans le navigateur de Windows. Si la page ne s'ouvre pas, activer le réseau partagé de WSL : créer `%UserProfile%\.wslconfig` avec les deux lignes `[wsl2]` et `networkingMode=mirrored`, puis `wsl --shutdown` dans PowerShell et relancer.
- **Relancer après une modification**, ou pour repartir d'un jeu de démo propre : Ctrl+C, puis `outils/essayer.sh` à nouveau.
- **Arrêter** : Ctrl+C (la vitrine), puis `outils/essayer.sh arreter` (la base et l'API).
- **Autre port** : `PORT_VITRINE=4300 outils/essayer.sh`, et les adresses deviennent `…localhost:4300`.

## 3. Quoi essayer

**Maison Selma** (éditorial)
- L'en-tête est posé sur la photo d'ouverture ; il redevient opaque quand on descend.
- Survoler une carte : la deuxième photo du produit apparaît (robe à bretelles, pull mérinos, polo).
- Catalogue → **Filtrer** : cocher une taille ; le tiroir reste ouvert pour cocher la suivante ; « Voir les N résultats » le referme. Retirer un filtre par sa puce. Trier par prix.
- Fiche produit : choisir une taille, **Ajouter au panier** → le panier s'ouvre, avec la vignette et la jauge « plus que … pour la livraison offerte ».

**Quincaillerie du Sud** (technique)
- Chercher dans la grande barre, par référence ou par nom : `PV14`, `casque`, `forets`.
- Rayon Outillage électroportatif : colonne de filtres à gauche (diamètre, version, prix, stock).
- Sur une carte à une seule déclinaison, **Ajouter** met directement au panier.
- Fiche perceuse : choisir « Kit 2 batteries », la référence suit la version.

**Maymar** : l'accueil, puis la fiche « Valise rigide ABS 4 roues » : choisir Grande 75 cm et Bordeaux — cette combinaison est épuisée, la fiche le dit et le bouton se désactive. Une valeur épuisée dans toutes ses combinaisons reste visible mais barrée : la taille M du combishort (Maison Selma), les forets de 10 mm (quincaillerie).

**Commander** (les trois boutiques) : dans le panier, **Commander**. Saisir un numéro tunisien (par exemple 20 123 456) et « Recevoir le code » : aucun SMS ne part, le code s'écrit dans `.outils/sms.log` (`tail -f .outils/sms.log` dans un autre terminal). Taper les 6 chiffres confirme le numéro ; choisir le gouvernorat fait apparaître les frais et le délai ; « Confirmer la commande » mène à la page de fin (numéro de commande, appel de confirmation, montant à régler au livreur).

**Sur téléphone** : dans Chrome ou Edge, F12 puis l'icône téléphone (« Toggle device toolbar »), choisir un modèle et recharger : menu en tiroir, galerie à faire glisser, barre d'achat collante en bas de la fiche. (Un vrai téléphone ne peut pas joindre la vitrine : elle reste sur ta machine.)

**Backoffice** — http://console.localhost:4200, mot de passe `equipe-locale-skanecom` : `appels@maymar.test` (confirmation des commandes) ou `gerant@maymar.test` (propriétaire, double authentification à la première connexion). Les onze commandes de démonstration de Maymar : appeler, confirmer, expédier, noter une livraison ou un refus. Onglet **Catalogue** : filtrer (en vitrine, brouillons, stock bas), ouvrir un produit, enregistrer une réception ou un inventaire, changer un prix, ajouter une couleur, ajouter des photos (glisser-déposer ; les ranger, les légender, en attitrer une à une couleur) ; **Nouveau produit** : un nom, un prix, ses tailles et couleurs, et toutes les déclinaisons sont créées (en brouillon, sans stock).

**Console** — http://console.localhost:4200, `admin@skanecom.test`, mot de passe `console-locale-skanecom` (base locale seulement). À la première connexion, scanner le QR code avec une application d'authentification (Google Authenticator, Microsoft Authenticator, 1Password…) et saisir le code. Ensuite : créer une boutique et son domaine, l'ouvrir, régler sa marque (gabarit, couleurs, polices, textes) avec l'aperçu, importer un catalogue (le modèle CSV se télécharge depuis la page d'import).

**Donner l'accès au backoffice** — dans la console, fiche de la boutique → **Gérer l'équipe** : saisir une adresse (inventée, par exemple `papa@maymar.test`) et un rôle, **Inviter**. La console affiche le lien d'accès à envoyer (bouton « Envoyer par WhatsApp »). L'ouvrir dans une **fenêtre de navigation privée** (sinon il remplace ta session de console) : choisir un mot de passe, et l'on arrive dans le backoffice de la boutique — après la double authentification pour un propriétaire. Depuis la liste : changer le rôle, retirer l'accès (la personne est dehors aussitôt), le rendre, ou remettre un lien si le mot de passe est oublié.

## 4. Les vérifications automatiques

Ce que la CI rejoue à chaque modification, lançable aussi à la main. Les tests de la base se suffisent à eux-mêmes ; les trois autres demandent la vitrine lancée par `outils/essayer.sh` dans un autre terminal :

```bash
outils/base-locale.sh tester                   # 410 tests de la base (isolation des boutiques, vitrine, console, import, commande, backoffice, équipes, catalogue, photos)
outils/essai-vitrine.sh                        # 25 essais : les boutiques ne se mélangent jamais, le tunnel n'est jamais en cache
cd application
bunx playwright-core install --with-deps chromium   # une fois (demande sudo)
bun run parcours                               # le testeur « humain » : souris, clavier, téléphone
bun run parcours:commande                      # une vraie commande dans chaque gabarit (base fraîche : outils/essayer.sh)
bun run parcours:gestion                       # l'équipe de Maymar traite ses commandes au backoffice
bun run apercu                                 # captures des pages clés des trois boutiques
```

Les captures arrivent dans `.outils/captures/` (à la racine du dépôt).

## En cas de souci

| Message | Que faire |
|---|---|
| `✗ Postgres 16 introuvable` ou `pgTAP manque` | `sudo apt install postgresql-16 postgresql-16-pgtap` |
| `✗ Node … Node 22 au moins est attendu` | `nvm install 22 && nvm use 22` |
| `✗ Le port 4200 est déjà pris` | une vitrine tourne déjà (Ctrl+C dans son terminal), ou `PORT_VITRINE=4300 outils/essayer.sh` |
| `Le port 54321 est déjà pris` ou `Le port 54322 est déjà pris par une autre base` | une autre copie de SkanEcom tourne, depuis un autre dossier : `outils/essayer.sh arreter` dans ce dossier-là, puis relancer |
| `Ce cluster n'a pas de superutilisateur supabase_admin` | `outils/base-locale.sh detruire`, puis relancer |
| La compilation échoue | la fin du journal s'affiche ; le journal complet est dans `.outils/essayer.log` |
| La page dit « Adresse inconnue » | ouvrir l'adresse avec le nom de la boutique : `mode.localhost:4200`, pas `localhost:4200` |
