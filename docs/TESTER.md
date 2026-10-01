# Tester SkanEcom soi-même

Cinq boutiques de démonstration tournent avec la même application, chacune avec son gabarit :

| Adresse | Boutique | Gabarit |
|---|---|---|
| http://mode.localhost:4200 | Maison Selma — prêt-à-porter | Immersif |
| http://maymar.localhost:4200 | Maymar — bagages | éditorial |
| http://quincaillerie.localhost:4200 | Quincaillerie du Sud — outillage | Commerce |
| http://beaute.localhost:4200 | Yasmine Beauté — soins et parfums | Monoproduit |
| http://maison.localhost:4200 | Dar Alia — maison et décoration | Bento |
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

**Maison Selma** (Immersif, sur les composants éditoriaux)
- L'ouverture prend tout l'écran, l'en-tête posé sur la photo ; il redevient opaque quand on descend.
- **La pièce de la saison**, juste après : la robe à bretelles en grand, choisir M, **Ajouter au panier** sans quitter l'accueil (au téléphone, la barre d'achat colle en bas une fois le bloc passé).
- Les nouveautés et les collections glissent : au doigt, ou par les flèches (le compteur suit).
- **Le lookbook** : la carte du combishort est ouverte sur la photo ; Échap la ferme, Entrée sur le point la rouvre ; la liste à côté mène à la fiche. Dans l'éditeur (`gerant@selma.test`, Vitrine → Accueil → Lookbook), cliquer la photo pose un point, le glisser ou ses flèches le déplacent (Maj : 5 % d'un coup), chacun choisit sa pièce.
- Survoler une carte : la deuxième photo du produit apparaît (robe à bretelles, pull mérinos, polo).
- Catalogue → **Filtrer** : cocher une taille ; le tiroir reste ouvert pour cocher la suivante ; « Voir les N résultats » le referme. Retirer un filtre par sa puce. Trier par prix.
- Fiche produit : choisir une taille, **Ajouter au panier** → le panier s'ouvre, avec la vignette et la jauge « plus que … pour la livraison offerte ».
- **Avis clients** (les trois boutiques ont le module) : la « Robe à bretelles en lin » montre sa note sur sa carte du rayon Robes et sous le titre de sa fiche (4,7 · 3 avis) et, plus bas, les avis vérifiés, la répartition des notes et la réponse de la boutique. Au backoffice de Selma (`gerant@selma.test`), **Avis** : l'avis de Yosra attend la relecture ; répondre, publier, ou écarter avec un motif. Une commande livrée propose, dans « Mes commandes », « Donner mon avis » sur chaque article (cinq étoiles, un mot facultatif) ; Réglages → Avis clients : relu avant publication, ou publié aussitôt.
- **Site vitrine** (aucune boutique ne l'a d'office) : au backoffice de Dar Alia (`gerant@dar-alia.test`), Réglages → Commandes → « Le site » → « Un site vitrine », Enregistrer. Sur la vitrine, plus de panier ; une fiche propose « Écrire sur WhatsApp » (le message nomme la pièce et sa référence), l'appel, l'e-mail ; /commande dit comment joindre la boutique. Revenir à « Une boutique en ligne ».
- **Achat express** (Selma a le réglage) : sur une fiche, **Commander maintenant** mène droit à la commande avec cet article seul ; le panier reste tel quel. Sur téléphone, la barre collante propose les deux (l'icône du panier, « Commander maintenant »). Au backoffice, Réglages → Commandes → « Depuis la fiche d'un produit » : par le panier, ou achat express en plus.

**Quincaillerie du Sud** (Commerce, sur les composants techniques)
- L'accueil s'ouvre sur la recherche : taper `perc` dans la grande barre, les pièces s'affichent pendant la frappe ; les rayons en raccourcis dessous, les services en bande.
- Sous les services, **trois bannières qui défilent** (une toutes les six secondes) : les flèches, les points, la pause ; au téléphone, les faire glisser au doigt. Un geste arrête le défilement. Entrée (ou un clic) sur la première mène au rayon Scies.
- **Tous les rayons** : le grand menu ; survoler « Quincaillerie », ses sous-rayons paraissent. Au clavier : Tab jusqu'au bouton, Entrée, Tab, ↓, Tab entre dans les sous-rayons ; Échap referme.
- **Comparer** : dans Perceuses et visseuses, survoler une carte, cocher « Comparer » sur deux pièces ; la barre du bas les montre ; « Comparer (2) » les met côte à côte (« Seulement les différences », « Retirer »).
- Au téléphone : la barre d'onglets en bas (Accueil, Rayons, Chercher, Compte, Panier) ; elle se retire sur une fiche.
- Chercher dans la grande barre, par référence ou par nom : `PV14`, `casque`, `forets`.
- Rayon Outillage électroportatif : colonne de filtres à gauche (diamètre, version, prix, stock).
- Sur une carte à une seule déclinaison, **Ajouter** met directement au panier.
- Fiche perceuse : choisir « Kit 2 batteries », la référence suit la version.
- Ouvrir trois ou quatre fiches, puis une autre : en bas, **Vus récemment** reprend les pièces vues, la plus récente d'abord (prix et stock du moment ; « Effacer » vide la liste). La page introuvable le propose aussi.

**Yasmine Beauté** (Monoproduit) : l'accueil est la page de vente de son sérum éclat — choisir « 3 pièces » (à la souris, ou aux flèches) : « Commander · 147,000 TND », le formulaire dessous dit « Votre offre : 3 pièces » et son récapitulatif « Prix par 3 », 177,000 barré ; « Commander » y mène, le curseur dans le téléphone ; la commande se passe là, sans toucher au panier. Au téléphone, les offres en lignes, et après le formulaire la barre « Commander » en bas. Puis l'huile de figue de Barbarie — 30 ml change le prix ; le vernis à ongles, ses teintes en pastilles (au clavier : Tab depuis le titre, Entrée ; « Corail » : plus que 2) ; le savon à l'huile d'olive, parfum « Fleur d'oranger » épuisé : « Prévenez-moi de son retour » ; ses prix par quantité (3 pour 30,000, 6 pour 54,000) : choisir « 3 pièces », ajouter, le tiroir et la commande disent « 3 pour 30,000 ».

**Dar Alia** : l'accueil en Bento — une mosaïque de tuiles, l'en-tête flottant en pilule ; à côté de l'ouverture, la pièce à la une, le paiement à la livraison et la note de ses huit avis ; cinq rayons (le premier sur deux rangées), « Nos essentiels », les avis, puis le kilim tissé main — 120 × 180 cm : 349 dinars, plus que 2 ; 160 × 230 cm, épuisé, barré ; les serviettes de table en lin, leurs couleurs en pastilles (Sable, Écru), au clavier ; au téléphone, le menu → Luminaires.

**L'éditeur de la vitrine** — au backoffice (http://console.localhost:4200), `gerant@dar-alia.test`, mot de passe `equipe-locale-skanecom` (double authentification à la première connexion), onglet **Éditeur de la vitrine** (plein écran ; « ← Backoffice » pour revenir) : à droite, la vraie vitrine de Dar Alia, sur ordinateur ou téléphone, et la page voulue (accueil, catalogue, une fiche, la commande). À gauche, chaque réglage s'y voit aussitôt : la structure (éditoriale, Bento — la mosaïque de Dar Alia —, technique ; ses coins et ses boutons conseillés viennent avec), une ambiance (« Nuit » passe en mode sombre), le fond, l'accent (et tout autre au nuancier ; la lisibilité est mesurée dessous), les treize couleurs une à une, la police des titres (onze familles, Bodoni Moda, Fraunces, Syne…) et du texte, la taille et l'écriture des titres, les coins, la forme et la couleur des boutons, les cartes, le format des photos, l'espace entre les sections, les animations. Ctrl+Z défait, Ctrl+Maj+Z refait ; « Avant / après » montre la version publiée. Chaque geste s'enregistre seul dans un brouillon que les visiteurs ne voient pas ; « Sur votre téléphone » donne le lien qui l'ouvre ailleurs, avec un bandeau. **Publier** le met en ligne ; « Revenir à la version publiée » l'abandonne. Le panneau **Accueil** : les sections de haut en bas — montez-en une (au clavier : Tab jusqu'à « Monter », Entrée), retirez-la puis « Rétablir », ajoutez-en depuis « Ajouter une section », changez la photo d'ouverture ; l'aperçu suit chaque geste sans recharger. Survolez une section de l'aperçu : son nom s'affiche ; cliquez-la : ses réglages s'ouvrent à gauche ; tapez un titre, il paraît une seconde plus tard. Ou écrivez sur la vitrine même : cliquez le titre de l'ouverture dans l'aperçu, tapez (le champ « Titre » suit, à gauche), Entrée pour finir ; cliquez le bouton, tapez, Échap : il redit ce qu'il disait. Le panneau **En-tête et pied** : tapez une annonce (elle paraît en tête de la vitrine), un compte Instagram (« pas un compte » est refusé sous le champ ; « @atelier.alia » passe), le bouton WhatsApp ; cliquez le pied de page de l'aperçu, son panneau s'ouvre. Le panneau **Pages** : ouvrez « Le magasin » (la vitrine du cadre va sur la page), changez une phrase, elle paraît une seconde plus tard ; « Livraison et retours » (un modèle composé des réglages) crée une page neuve, encore hors ligne mais visible à côté ; les flèches rangent les pages (le pied de page suit, aussitôt) ; « Retirer… » la retire de la boutique, après confirmation. **Publier** met le style, l'accueil, l'en-tête et le pied, et les pages en ligne d'un coup.

**Maymar** : l'accueil, puis la fiche « Valise rigide ABS 4 roues » : choisir Grande 75 cm et Bordeaux — cette combinaison est épuisée, la fiche le dit et le bouton se désactive. Une valeur épuisée dans toutes ses combinaisons reste visible mais barrée : la taille M du combishort (Maison Selma), les forets de 10 mm (quincaillerie).

**Commander** (les trois boutiques) : dans le panier, **Commander**. Saisir un numéro tunisien (par exemple 20 123 456) et « Recevoir le code » : aucun SMS ne part, le code s'écrit dans `.outils/sms.log` (`tail -f .outils/sms.log` dans un autre terminal). Taper les 6 chiffres confirme le numéro ; choisir le gouvernorat fait apparaître les frais et le délai ; cocher « J'ai lu et j'accepte les conditions de vente », puis « Confirmer la commande » mène à la page de fin (numéro de commande, appel de confirmation, montant à régler au livreur).

**Sur téléphone** : dans Chrome ou Edge, F12 puis l'icône téléphone (« Toggle device toolbar »), choisir un modèle et recharger : menu en tiroir, galerie à faire glisser, barre d'achat collante en bas de la fiche. (Un vrai téléphone ne peut pas joindre la vitrine : elle reste sur ta machine.)

**Backoffice** — http://console.localhost:4200, mot de passe `equipe-locale-skanecom` : `appels@maymar.test` (confirmation des commandes) ou `gerant@maymar.test` (propriétaire, double authentification à la première connexion). L'écran **Aujourd'hui** (en tête de la navigation) dit ce qui attend : commandes à confirmer et à rappeler, colis à préparer, en route, demandes des modules, stock à réassortir, et la journée en chiffres ; chaque carte ouvre sa liste. Les onze commandes de démonstration de Maymar : appeler, confirmer, expédier, noter une livraison ou un refus ; à l'étape « À préparer », « Bordereaux » les imprime deux par feuille (ou en PDF). Onglet **Catalogue** : filtrer (en vitrine, brouillons, stock bas), ouvrir un produit, enregistrer une réception ou un inventaire, changer un prix, ajouter une couleur, ajouter des photos (glisser-déposer ; les ranger, les légender, en attitrer une à une couleur) ; **Nouveau produit** : un nom, un prix, ses tailles et couleurs, et toutes les déclinaisons sont créées (en brouillon, sans stock). Onglet **Réglages** : ouvrir aux invités, confirmer d'office, passer aux frais par zone, ajouter une zone et lui rattacher des gouvernorats ; le journal à droite garde chaque changement ; tout en bas, « Vos données » télécharge commandes, clients, catalogue et stock en CSV. Onglet **Catalogue → Caractéristiques** : définir une caractéristique (« Volume », en L, un nombre, filtrable, rayon Valises), puis la saisir sur la fiche d'un produit (section « Fiche technique ») ; la vitrine l'ajoute au tableau de la fiche et aux filtres du rayon. La quincaillerie de démonstration en a déjà : http://quincaillerie.localhost:4200/categorie/outillage (filtres « Alimentation », « Puissance », pastilles sur les cartes). **Quantité minimale** : les vis à bois au détail s'y vendent par 20 au moins (http://quincaillerie.localhost:4200/produit/vis-bois-tete-fraisee : le sélecteur part de 20, la boîte de 200 revient à l'unité) ; sur la fiche d'un produit du backoffice, le champ « Minimum » de chaque déclinaison. **Comptes professionnels** (la quincaillerie a le module) : dans http://quincaillerie.localhost:4200/compte, connecté par SMS, « Demander un compte pro » ; au backoffice (un propriétaire de la quincaillerie), Clients → « Comptes professionnels » : la demande de la Plomberie Ben Salem attend, valider la vôtre ; revenir sur la perceuse : « Votre prix pro », le prix public barré, puis « Tarif professionnel appliqué » au tunnel ; le champ « Prix pro » de chaque déclinaison sur la fiche produit du backoffice. **Devis** (la quincaillerie a le module) : remplir le panier, puis dans le tiroir « Demander un devis » ; au backoffice, `gerant@quincaillerie.test` (propriétaire de la quincaillerie, double authentification à la première connexion) ouvre « Devis » : la demande du plombier et la vôtre attendent ; appliquer une remise, offrir la livraison, « Envoyer le devis » (le message WhatsApp est prêt) ; de retour dans « Mes commandes », « Mes devis » : « Accepter et commander », et le tunnel passe la commande aux prix du devis. Un devis prêt attend déjà l'électricienne du jeu de démo : ouvrir http://quincaillerie.localhost:4200/commande?devis=DEV-00002 dans une fenêtre privée, se connecter sur place avec le 22 345 002 (pro validée ; le 98 765 001 est le plombier), et le devis s'ouvre à ses prix. Onglet **Clients** : l'onglet « Avec refus », une fiche, la bloquer (un motif est demandé), la rétablir ; depuis une commande, « Voir sa fiche ». Onglet **Équipe** (le gérant) : inviter un employé, ouvrir son lien dans une fenêtre privée, changer son rôle, lui retirer l'accès.

**Console** — http://console.localhost:4200, `admin@skanecom.test`, mot de passe `console-locale-skanecom` (base locale seulement). À la première connexion, scanner le QR code avec une application d'authentification (Google Authenticator, Microsoft Authenticator, 1Password…) et saisir le code. Ensuite : créer une boutique et son domaine, l'ouvrir, régler sa marque (gabarit, couleurs, polices, textes) avec l'aperçu, importer un catalogue (le modèle CSV se télécharge depuis la page d'import), puis **ses photos** : « Déposer les photos », un dossier ou un .zip de photos nommées d'après les références (`PP18-KIT.jpg`, `PP18-KIT-2.jpg`) ; le rapport montre ce qui va où avant l'envoi, et un envoi se retire d'un geste.

**Donner l'accès au backoffice** — dans la console, fiche de la boutique → **Gérer l'équipe** : saisir une adresse (inventée, par exemple `papa@maymar.test`) et un rôle, **Inviter**. La console affiche le lien d'accès à envoyer (bouton « Envoyer par WhatsApp »). L'ouvrir dans une **fenêtre de navigation privée** (sinon il remplace ta session de console) : choisir un mot de passe, et l'on arrive dans le backoffice de la boutique — après la double authentification pour un propriétaire. Depuis la liste : changer le rôle, retirer l'accès (la personne est dehors aussitôt), le rendre, ou remettre un lien si le mot de passe est oublié.

**Entrer dans le backoffice d'un client (support)** — dans la console, onglet **Support** d'une boutique : dire pourquoi on entre, choisir « Regarder » ou « Agir comme un administrateur » et une durée, **Entrer dans son backoffice**. On y arrive avec un bandeau noir en haut (le mode, l'heure de fin, le motif) et **Fermer l'accès** ; échu ou fermé, le backoffice renvoie à la console. Le propriétaire (`gerant@maymar.test`) retrouve chaque accès dans **Équipe → Le support SkanEcom**, et peut fermer un accès encore ouvert.

## 4. Les vérifications automatiques

Ce que la CI rejoue à chaque modification, lançable aussi à la main. Les tests de la base se suffisent à eux-mêmes ; les trois autres demandent la vitrine lancée par `outils/essayer.sh` dans un autre terminal :

```bash
outils/base-locale.sh tester                   # 1053 tests de la base (isolation des boutiques, vitrine, console, import, commande, backoffice, équipes, catalogue, photos, réglages, clients, pages légales, images de la marque, modules, retrait en magasin, mes commandes, mise en place, accès support, photos à l'import, fiches techniques, supplément au poids, service après-vente, tableau de bord, encaissements, réception, quantité minimale, comptes professionnels, devis, achat express, avis clients, vérification par e-mail)
outils/essai-vitrine.sh                        # 26 essais : les boutiques ne se mélangent jamais, le tunnel et le compte ne sont jamais en cache
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
