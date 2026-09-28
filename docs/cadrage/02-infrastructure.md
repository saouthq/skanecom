# SkanEcom — Cadrage de l'infrastructure (v0)

> Statut : **proposition à valider par Skander**. Rédigé le 28/09/2026.
> Répond aux deux exigences posées par Skander le 28/09 :
> 1. **Tenir la charge.** Si un jour on a beaucoup d'entreprises, la plateforme absorbe tout le trafic sans bloquer.
> 2. **Rester ouvert.** Le jour où le système tombe en panne, les sites des clients continuent de marcher.
>
> Chaque chiffre est soit sourcé, soit marqué **hypothèse**. Les prix des fournisseurs changent : ceux notés « à reconfirmer » doivent être vérifiés sur la grille officielle avant toute décision d'achat.

---

## 0. L'essentiel en une page

**Trois décisions de structure répondent aux deux exigences :**

1. **L'acheteur ne parle jamais directement à la base de données.** Une *façade* placée en bordure de réseau (Cloudflare, qui a un point de présence à Tunis) sert chaque boutique depuis son cache. Si l'application ou la base ne répondent plus, elle sert la dernière version connue, puis un *instantané* stocké à part. Les données vivent derrière, la vitrine reste devant.
2. **Une seule plateforme, découpée en « cellules ».** Toutes les boutiques partagent le même code. Leurs données vivent dans des cellules : une cellule, c'est une base Postgres qui porte un groupe de boutiques. On lance avec une cellule. Quand elle se remplit, on en ouvre une autre sans rien réécrire. C'est le principe des *pods* de Shopify.
3. **Tout ce qui est lent ou externe passe par une file d'attente** : SMS, WhatsApp, livreurs, e-mails, instantanés, exports. En paiement à la livraison (COD), une commande est une simple demande qui n'exige aucune validation bancaire. On peut donc **la prendre même base arrêtée** et l'enregistrer au retour. Le COD, qui semble archaïque, devient ici un atout de résilience.

**Pile recommandée : option A.**
- **Cloudflare en façade** : DNS, CDN, domaines des clients, Worker de façade, images sur R2, file de secours des commandes.
- **Vercel** pour l'application Next.js : vitrine, backoffice, API.
- **Supabase** pour Postgres et l'authentification, en région Paris (eu-west-3).

Le seul choix difficile à défaire, c'est l'acteur qui porte les domaines des clients. On le place chez Cloudflare dès le premier jour. L'application derrière reste remplaçable.

**Objectifs de disponibilité mensuelle :**

| Service | Objectif | Temps d'arrêt toléré par mois |
|---|---|---|
| Vitrine (consulter) | 99,95 % | ≈ 22 min |
| Prise de commande COD | 99,9 % | ≈ 44 min |
| Backoffice marchand | 99,5 % | ≈ 3 h 40 |

**Aucune commande acceptée n'est perdue.**

**Le risque n°1 n'est pas technique.** Nos fournisseurs se paient en dollars. Or la carte technologique internationale (CTI) d'une société est plafonnée à **10 000 TND par an**, soit environ 3 390 $. Une carte refusée, c'est la mise en pause des projets Supabase, puis l'arrêt des déploiements Vercel au bout de 14 jours : **toutes les boutiques tombent en même temps** (§7). Il faut obtenir le **label Startup Act** avant d'atteindre environ 300 boutiques.

---

## 1. Hypothèses de charge

Aucune source fiable ne donne le nombre de vendeurs en ligne tunisiens. Les estimations de marché divergent d'un facteur 4 (voir le PRD, §2). On raisonne donc **par scénarios**, pas par parts de marché. D'après l'étude de marché, quelques milliers de boutiques à 3-5 ans est réaliste. On conçoit pour **10 000 boutiques sans refonte**, sans surinvestir au départ.

### 1.1 Profils de boutique (hypothèses)

| Profil | Part des boutiques | Visites/jour | Pages/visite | Pages vues/jour | Commandes/jour (conversion 1,5 %) |
|---|---|---|---|---|---|
| Petit vendeur (Starter) | 70 % | 150 | 4 | 600 | ≈ 2 |
| Boutique qui grandit (Pro) | 25 % | 800 | 5 | 4 000 | 12 |
| Entreprise établie (Business) | 5 % | 5 000 | 6 | 30 000 | 75 |

Le taux de conversion de 1,5 % est une **hypothèse** : aucune mesure tunisienne fiable n'a été trouvée. On la recalera sur les vraies données de Maymar.

### 1.2 Ce que ça donne par horizon

| | 100 boutiques | 1 000 boutiques | 10 000 boutiques |
|---|---|---|---|
| Pages vues/jour | 292 000 | 2,92 M | 29,2 M |
| Pages vues/s en moyenne | 3,4 | 34 | 338 |
| Pages vues/s en pic (×10) | 34 | 340 | 3 400 |
| Commandes/jour | ≈ 830 | ≈ 8 300 | ≈ 83 000 |
| Commandes/s en pic | 0,1 | 1 | 10 |
| Requêtes vers l'application en pic (95 % servies par le cache) | ≈ 2/s | ≈ 17/s | ≈ 170/s |
| Données transférées/mois (0,3 Mo effectifs par page, cache du navigateur déduit) | ≈ 2,6 To | ≈ 26 To | ≈ 263 To |

Le facteur ×10 cumule le pic du soir et les jours de campagne. S'ajoutent les pics saisonniers : Ramadan, Aïd, soldes d'été et d'hiver, rentrée scolaire, Black Friday.

### 1.3 Le vrai danger : le pic sur UNE boutique

Plus de 80 % du trafic des boutiques tunisiennes vient des publicités Meta et des influenceurs (baromètre MDWEB). Le cas dimensionnant est donc le « post viral ». Par exemple, 30 000 visites en 30 minutes sur une seule boutique :
- environ 50 pages vues/s,
- environ 600 commandes en une demi-heure, dont beaucoup sur le même produit.

Une façade en cache absorbe ce pic sans effort. Sans cache, c'est la base partagée qui encaisserait, et **toutes les autres boutiques ralentiraient**. C'est le « voisin bruyant ».

### 1.4 Ce qui casse vraiment en premier (par ordre de probabilité)

1. **La facture de bande passante, avant la technique.** Voir le §7 : c'est la raison principale de mettre Cloudflare et R2 devant.
2. **Les pages non mises en cache martelées par des robots** : recherche, filtres, calcul du panier.
3. **Les requêtes lourdes du backoffice sur la base partagée** : exports, statistiques, listes de 10 000 commandes.
4. **L'épuisement des connexions Postgres** par les fonctions serverless.
5. **Les limites des API tierces.** L'API de First Delivery, par exemple, accepte 1 requête toutes les 10 s et 100 colis par envoi ([doc First Delivery](https://www.firstdeliverygroup.com/api/v2/documentation)).
6. **La contention sur une variante très demandée.** C'est le cas le moins inquiétant : voir le §3.3.

---

## 2. Architecture cible

```mermaid
flowchart LR
  A[Acheteur<br/>mobile 4G] --> F
  subgraph CF[Cloudflare — la façade]
    F[Worker de façade<br/>routage par domaine,<br/>cache, limites]
    K[(Annuaire<br/>domaine → boutique → cellule<br/>KV)]
    R[(Instantanés des vitrines<br/>+ images — R2)]
    Q[(Tampon de commandes<br/>Durable Objects)]
    F --- K
    F --- R
    F --- Q
  end
  F -->|si en ligne| V[Application Next.js<br/>Vercel]
  V --> S1[(Cellule 1<br/>Supabase Postgres<br/>Paris)]
  V -.-> S2[(Cellule 2…<br/>plus tard)]
  S1 --> O[Files de travail<br/>SMS · WhatsApp · livreurs ·<br/>e-mails · instantanés]
  Q -->|rejeu au retour| V
  M[Commerçant<br/>backoffice] --> V
```

| Couche | Rôle | Fournisseur (reco) | Tombe si… | Impact pour l'acheteur |
|---|---|---|---|---|
| DNS et domaines | `skanecom.tn`, domaine des vitrines, domaines des clients, certificats | Cloudflare (+ Cloudflare for SaaS) | Panne mondiale de Cloudflare | Tout est inaccessible (voir §4.4) |
| Façade | Trouve la boutique à partir du domaine, sert le cache, applique les replis, prend les commandes en mode dégradé, limite les abus | Cloudflare Workers | idem | idem |
| Images | Stockage et redimensionnement des photos produit | Cloudflare R2 + Images | Panne R2 | Images absentes, texte et prix visibles |
| Application | Rendu des pages, backoffice, API, logique métier | Vercel (Next.js) | Panne Vercel ou déploiement cassé | **Rien** : la façade sert le cache et les instantanés |
| Données | Boutiques, catalogue, stock, commandes, clients, comptes | Supabase Postgres + Auth, Paris | Panne Supabase ou de la région | **Rien pour consulter** ; commandes mises en tampon |
| Travail asynchrone | SMS, WhatsApp, livreurs, e-mails, instantanés, exports | Outbox Postgres + Supabase Queues (pgmq), consommateurs planifiés | Panne des consommateurs | Rien : les messages attendent et partent au retour |
| Plan de contrôle | Comptes marchands, abonnements, factures, annuaire des cellules | Schéma `plateforme` (dans la cellule 1 au début, isolé ensuite) | — | — |

**Pourquoi les images ne sont pas dans Supabase Storage** (où Maymar les prévoyait) : si Supabase tombe, une vitrine sans photos ne vend pas. Sur R2, les images sont servies par la même bordure que les pages, sans frais de sortie de données.

---

## 3. Exigence 1 — tenir la charge sans bloquer

### 3.1 La lecture ne touche pas la base

- Les pages de vitrine sont **générées puis mises en cache à la bordure** : accueil, rayons, fiches produit. La clé de cache est `domaine + chemin`. Objectif : **95 % au moins des pages vues servies par le cache**.
- **L'invalidation se fait par boutique, pas par minuterie.** Quand un commerçant modifie un prix, l'application purge les étiquettes `boutique:<id>` et `produit:<id>`. Maymar régénère aujourd'hui toutes les 5 minutes (`revalidate = 300`). En multi-boutique, on passe à des durées longues avec purge ciblée.
- **Le prix et le stock affichés sont « presque frais ».** Le **prix et le stock réels sont recalculés par la base au moment de la commande**. C'est déjà le contrat de Maymar : aucune commande n'est créée côté navigateur (`commandes.sql`, décision de sécurité).
- **Recherche et filtres** : cache court à la bordure, clé = requête normalisée, limitation de débit par adresse IP. La recherche plein texte reste dans Postgres en v1. Un moteur dédié (Typesense ou Meilisearch) ne sera ajouté que si les mesures l'exigent.

### 3.2 Chaque boutique dans son couloir (voisins bruyants)

| Mécanisme | Où | Effet |
|---|---|---|
| Limite de requêtes non mises en cache, par boutique et par IP | Façade | Un robot ou une boutique virale ne sature pas l'application |
| Quotas par offre (produits, employés, SMS/mois, exports/jour) | Application (réglages de l'offre) | Coûts maîtrisés, voir le principe « tout est réglage » du PRD |
| Délai maximal par requête SQL et par rôle (`statement_timeout`) | Postgres | Une requête qui dérape est coupée, elle ne bloque pas la base |
| Exports, statistiques et imports **toujours en tâche de fond** | Files | Le backoffice ne fait jamais tourner une requête de 30 s |
| Pool de connexions en mode transaction | Pooler Supabase ([doc](https://supabase.com/docs/guides/database/connecting-to-postgres)) | Les fonctions serverless ne saturent pas les connexions |
| **Cellule dédiée** pour un client Business qui l'exige | Cellules | L'équivalent du « serveur dédié » de TikTak PRO, sans serveur à gérer |

### 3.3 Les écritures : courtes, locales, sans appel externe

- **Une commande, c'est une seule transaction courte**, exécutée par une fonction SQL (RPC). Elle recalcule les prix, réserve le stock, numérote la commande et écrit un message dans l'*outbox*. **Aucun appel externe dans la transaction** (SMS, livreur, paiement) : ils partent ensuite par la file.
- **Stock d'une variante très demandée.** Maymar réserve déjà le stock dans la même transaction, avec un verrou sur la ligne de la variante (`reservation_stock.sql`). Chaque verrou dure quelques millisecondes : **des centaines de commandes par seconde sur une même variante** restent possibles. Le pire cas du §1 est d'environ 1 à 10 commandes/s, toutes boutiques confondues, soit une marge de ×10 à ×100.
- **Numéro de commande par boutique.** On remplace la séquence globale `MAY-AAAA-00001` par un compteur par boutique, avec un préfixe réglable.
- **Idempotence.** Chaque commande porte une clé générée par le navigateur. Rejouer une commande (double clic, réseau coupé, rejeu du tampon) ne crée jamais de doublon.

### 3.4 Les cellules : grandir sans réécrire

- **Définition.** Une cellule = un projet Supabase (Postgres, Auth, pooler), dans une région donnée. Chaque boutique appartient à une seule cellule, écrite dans l'**annuaire**. L'annuaire est répliqué dans Cloudflare KV, donc lisible en bordure même si les cellules sont en panne.
- **Au lancement : une seule cellule.** Elle porte aussi le schéma `plateforme` (comptes marchands, offres, abonnements, factures), rangé à part pour pouvoir l'extraire plus tard sans chirurgie.
- **Quand ouvrir une nouvelle cellule** (seuils à calibrer par test de charge, voir §6.3) : plus d'environ 2 000 boutiques, ou un processeur au-dessus de 60 % en pic soutenu, ou plus de 200 Go de données, ou un client Business qui demande une cellule dédiée. Ces seuils sont des **hypothèses de départ**.
- **Déménager une boutique** d'une cellule à l'autre, en 4 temps :
  1. copie logique de ses lignes, filtrées par `boutique_id` ;
  2. courte coupure des écritures, pendant laquelle les commandes passent par le tampon ;
  3. bascule de l'annuaire ;
  4. vérification.

  C'est aussi la procédure de **restauration d'une seule boutique** (§4.5).
- **Condition pour que ça marche.** Toutes les tables portent `boutique_id`, et aucune requête ne croise deux boutiques. C'est une règle de conception du modèle de données (voir `03-reprise-maymar.md`).

### 3.5 Les trois paliers

| | Lancement (Maymar + bêta, ≤ 100 boutiques) | 1 000 boutiques | 10 000+ boutiques |
|---|---|---|---|
| Façade | Worker : routage, cache, replis, tampon de commandes | + limites fines par boutique, règles anti-robots | Idem, offre Cloudflare supérieure si nécessaire |
| Application | Vercel, une région (Paris ou Francfort, proche de la base) | Idem, capacités augmentées | Idem, ou origine déplacée si les coûts l'exigent |
| Données | 1 cellule, instance Small ou Medium | 1 cellule plus grosse + réplica en lecture pour le backoffice | 4-6 cellules, plan de contrôle séparé |
| Files | pgmq + consommateurs planifiés | Idem, consommateurs parallèles par type | Idem, par cellule |
| Domaines personnalisés | Aucun (Maymar excepté) | Cloudflare for SaaS (100 inclus, puis 0,10 $/mois par domaine) | Idem (jusqu'à 50 000 hors Enterprise) |
| Exploitation | Tableaux de bord, alertes, page de statut | + test de charge trimestriel, exercice de panne | + astreinte structurée |

Chiffres Cloudflare for SaaS : [doc Cloudflare](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/), confirmés en août 2026.

---

## 4. Exigence 2 — les sites marchent encore quand le système tombe

### 4.1 Quatre filets pour la consultation

À chaque requête d'une page de vitrine, la façade descend cette échelle et s'arrête au premier palier qui répond :

1. **Cache frais** : la page est en cache et à jour. C'est le cas normal.
2. **Application** : la page est régénérée par l'application, mise en cache, puis servie.
3. **Cache périmé** : l'application renvoie une erreur 5xx ou dépasse le délai. La façade sert la dernière version en cache, même vieille de plusieurs heures. Mécanisme standard `stale-if-error` ([doc Cloudflare](https://developers.cloudflare.com/cache/concepts/cache-control/)).
4. **Instantané** : la page n'est pas en cache (page rarement vue, cache vidé). La façade sert l'**instantané R2** de la boutique. C'est un HTML statique de chaque page publique, régénéré en tâche de fond après chaque modification du catalogue.
5. **Page de secours** : ni cache ni instantané. Une page simple, aux couleurs de la boutique, avec son numéro WhatsApp et son téléphone : « Notre boutique revient dans quelques minutes, écrivez-nous. »

**Détail technique décisif, vérifié dans la doc Cloudflare.** `stale-if-error` ne fonctionne qu'**en l'absence de `s-maxage`, `must-revalidate` ou `proxy-revalidate`**. Il ne se déclenche que sur les erreurs 5xx, pas sur les 404 ([doc Workers Cache](https://developers.cloudflare.com/workers/cache/configuration/)). Or Next.js pose `s-maxage` par défaut sur ses pages en ISR. **La façade doit donc réécrire les en-têtes de cache** au lieu de se fier à ceux de l'application. On le teste en coupant volontairement l'origine (§6.3).

### 4.2 Prendre les commandes même base arrêtée (COD)

```
Acheteur valide son panier
  → Façade : l'application répond ?
       oui → commande normale (transaction SQL, stock réservé, numéro définitif)
       non → mode dégradé :
             1. prix recalculés depuis l'instantané signé de la boutique (pas depuis le navigateur)
             2. commande écrite dans le tampon durable de la boutique (Durable Object), avec sa clé d'idempotence
             3. l'acheteur voit : « Commande reçue. Le vendeur vous appelle pour confirmer. » + numéro provisoire
       au retour de la base → rejeu automatique, dans l'ordre d'arrivée :
             - création de la vraie commande, réservation du stock
             - si le stock manque : commande créée « à arbitrer », signalée en tête de la file de confirmation
             - le commerçant voit un bandeau « 12 commandes reçues pendant l'incident »
```

- **Pourquoi c'est acceptable en COD.** Aucun argent ne bouge au moment de la commande. La confirmation téléphonique a lieu de toute façon plus tard : c'est déjà le cycle de Maymar.
- **Le paiement en ligne est masqué automatiquement en mode dégradé.** Seul le COD reste proposé. Même règle quand un prestataire de paiement (PSP) est en panne ou gelé (voir le PRD : précédent Paymee).
- **Survente possible, mais bornée.** Elle ne peut dépasser que ce qui a été commandé pendant la panne. Elle se règle à l'appel de confirmation, ce qui est moins grave qu'une boutique fermée.
- **À prototyper à l'étape 1.** Choix entre Durable Objects (ordre garanti par boutique, stockage durable) et Cloudflare Queues. Mesure du temps de rejeu.

### 4.3 Matrice des pannes

| Panne | Ce que voit l'acheteur | Ce que voit le commerçant | Réaction automatique | Remise en service visée |
|---|---|---|---|---|
| **Base Supabase indisponible** | Boutique normale (cache et instantanés), commande « reçue, on vous appelle » | Backoffice indisponible, bandeau d'incident | Tampon de commandes, page de statut mise à jour | Quand Supabase revient ; rejeu en quelques minutes |
| **Région AWS Paris perdue** | Idem | Idem, plus longtemps | Idem | Restauration dans une autre région depuis la sauvegarde hors fournisseur : **≤ 24 h** |
| **Vercel indisponible** | Boutique normale (cache et instantanés), commandes en tampon | Backoffice indisponible | Idem | Quand Vercel revient |
| **Notre déploiement est cassé** | Idem : la façade sert le cache | Idem | Retour immédiat à la version précédente (rollback Vercel) | **< 5 min** |
| **Migration de base destructive** | Rien en consultation | Données faussées | Règles de migration (§4.6) + restauration à un instant donné (PITR) | **≤ 4 h** |
| **Paiement en ligne (Konnect/Flouci) en panne ou gelé** | Seul le COD est proposé | Alerte | Disjoncteur par PSP (erreurs + page de statut du PSP) | Automatique |
| **API d'un livreur en panne ou limitée** | Rien | Colis « en attente d'envoi » | La file réessaie avec des délais croissants ; bordereau PDF en repli manuel | Automatique |
| **SMS ou WhatsApp en panne** | Rien, ou message reçu plus tard | Confirmations retardées | Bascule sur le canal de secours (autre fournisseur SMS, appel manuel) | Automatique |
| **Carte refusée chez un fournisseur** | Rien au début, puis **tout tombe** (Supabase en pause, Vercel à J+14) | — | Alertes sur le plafond CTI et les échéances ; 2 cartes de 2 banques ; crédits Supabase prépayés (§7) | Prévention |
| **Domaine .tn expiré ou incident chez l'ATI** | Plus rien sous `.tn` | — | Domaine des vitrines en gTLD indépendant de l'ATI ; renouvellement pluriannuel ; alerte d'expiration | Prévention |
| **Attaque DDoS ou robots** | Rien, ou un défi anti-robots (Turnstile) au paiement | Rien | Protection Cloudflare, limites de la façade | Automatique |
| **Fuite de données entre boutiques** | — | — | Prévention par conception (§5) ; sinon procédure d'incident et notification | Voir le runbook |
| **Panne mondiale de Cloudflare** | **Tout est inaccessible** | Idem | Voir §4.4 | Quand Cloudflare revient |

### 4.4 Les limites, dites franchement

- **La façade est un point unique.** Si Cloudflare tombe entièrement, tout tombe, comme le 18/11/2025 et le 12/06/2025. On l'accepte, pour trois raisons :
  1. Cloudflare tombe beaucoup plus rarement que l'ensemble application + base qu'il protège.
  2. Une vraie redondance multi-CDN demande un second fournisseur de DNS et de CDN, et une double gestion des certificats des domaines clients. C'est hors de portée d'une équipe minuscule en v1.
  3. C'est le compromis retenu par la plupart des plateformes de cette taille.

  **Réévaluation prévue à 1 000 boutiques.** On étudiera alors un DNS secondaire et une façade de secours.
- **« Ne jamais fermer » veut dire : consulter et commander.** Le backoffice, lui, peut s'arrêter avec la base. Un commerçant ne pourra pas modifier un prix pendant une panne de Supabase, mais ses clients continueront de commander.
- **Le rendu de la toute première visite** d'une page jamais générée ni instantanée ne peut pas survivre à une panne de l'application. D'où l'instantané systématique des pages publiques.

### 4.5 Sauvegardes et reprise

| Donnée | Mécanisme | Perte maximale de données (RPO) | Remise en service (RTO) |
|---|---|---|---|
| Commandes pendant une panne | Tampon durable en bordure | **0** | Rejeu en quelques minutes |
| Base, cas courant | Sauvegardes quotidiennes Supabase (offre Pro) | 24 h | ≤ 4 h |
| Base, dès l'étape 3 | **Restauration à un instant donné (PITR, option payante Supabase)** | Quelques minutes | ≤ 4 h |
| Base, perte du fournisseur ou de la région | **Export quotidien chiffré vers R2** (autre fournisseur) | 24 h | ≤ 24 h |
| Une seule boutique (erreur du commerçant ou de notre part) | **Export logique quotidien par boutique** | 24 h (quelques minutes avec PITR + extraction) | ≤ 2 h, sans toucher aux autres boutiques |
| Images | R2, versionnage des objets | 0 | — |

- **Règle 3-2-1** : 3 copies, 2 supports, 1 hors du fournisseur principal.
- **Une sauvegarde non testée n'existe pas.** On fait un exercice de restauration mensuel, d'une boutique et de la base entière, dans un environnement jetable, avec un compte rendu.

### 4.6 Changer sans casser

- **Environnements** :
  - local ;
  - prévisualisation pour chaque branche ;
  - **cellule interne** : nos boutiques de test + Maymar, qui sert de **canari** ;
  - production.
- **Migrations en deux temps** (*expand / contract*). On ajoute d'abord, on bascule le code, puis on retire lors d'une version ultérieure. Jamais de `DROP` ni de renommage dans la même livraison que le code qui en dépend. Sur une base partagée par des milliers de boutiques, on n'accepte aucun verrou de table long : index créés en `CONCURRENTLY`, délais de verrou courts.
- **Les nouveautés passent par des réglages** (le principe du projet). On les active boutique par boutique, d'abord sur Maymar.
- **Déploiement progressif par cellule**, avec retour arrière immédiat.
- **Gel des déploiements** pendant les pics connus : dernière semaine du Ramadan, veille de l'Aïd, premiers jours des soldes.

### 4.7 Communiquer pendant une crise

- **Page de statut publique**, par composant (vitrines, commandes, backoffice, paiements, livreurs), hébergée **hors** de notre infrastructure.
- **Bandeau dans le backoffice** et message WhatsApp aux commerçants des cellules touchées.
- **Modèles de messages** prêts à l'emploi, en FR et en AR.
- **Argument commercial.** La panne OVH de 2017 a coupé environ 20 000 sites tunisiens ([Espace Manager](https://www.espacemanager.com/ovh-en-panne-20000-sites-web-tunisiens-et-plus-de-100000-boites-email-larret.html)). Aucun concurrent local ne publie de page de statut ni d'engagement de disponibilité (non trouvé, à vérifier). Afficher les nôtres est un différenciateur.

---

## 5. Sécurité et isolation entre boutiques

### 5.1 Le modèle

**Base partagée, `boutique_id` sur chaque ligne, RLS** (le modèle *pool*). On y ajoute trois règles qui rendent la fuite entre boutiques **impossible par construction**, et pas seulement « interdite » :

1. **Clés étrangères composites** `(boutique_id, id)`. Une ligne de commande ne peut pas pointer vers la variante d'une autre boutique : la base refuse. C'est important parce que les triggers de Maymar sont en `SECURITY DEFINER` et contournent donc la RLS.
2. **Fonctions d'autorisation par boutique.** On passe de `est_staff()` (« staff de toute la base ») à `est_membre(boutique_id, rôles)`. Elles restent dans le schéma `private`, comme le fait déjà Maymar (`durcissement_securite.sql`).
3. **Tests d'isolation automatiques en intégration continue** (pgTAP). Pour chaque table et chaque rôle, on vérifie qu'un membre de la boutique A ne lit ni n'écrit rien de la boutique B, par l'API et par les fonctions. **Un test rouge bloque la livraison.**

### 5.2 Les pièges propres à une plateforme multi-boutique

- **Le cache qui fuit.** Une page de backoffice ou de compte client en cache partagé serait servie à quelqu'un d'autre. Règles :
  - la façade ne met jamais en cache une réponse qui porte un cookie de session ou un en-tête `Authorization` ;
  - la clé de cache inclut toujours le domaine ;
  - le backoffice est sur un domaine à part.
- **Les domaines.** Il faut séparer le domaine de la plateforme (`skanecom.tn` : site commercial et backoffice) du **domaine des vitrines gratuites**, et déclarer ce dernier sur la [Public Suffix List](https://publicsuffix.org/), comme Shopify l'a fait avec `myshopify.com`. Deux effets :
  - une boutique ne peut pas lire les cookies d'une autre ;
  - une boutique frauduleuse signalée par Google Safe Browsing ne fait pas signaler tout `skanecom.tn`.

  Nom du domaine des vitrines à choisir (voir `04-risques-et-decisions.md`).
- **Le contenu des commerçants.** En v1, pas de HTML, de CSS ni de JavaScript libres dans les thèmes : seulement des sections structurées. Tout texte riche passe par un filtre à liste blanche.
- **L'import d'images par URL** passe par un service isolé (risque de SSRF).

### 5.3 Identité

- **Commerçants** : authentification à deux facteurs **obligatoire** pour les propriétaires et administrateurs de boutique. Supabase Auth gère le TOTP.
- **Acheteurs** : connexion par code SMS ou WhatsApp, ou par lien e-mail. Le compte obligatoire ou l'achat en invité est un **réglage de chaque boutique** (Maymar : compte obligatoire).
- **Une identité par personne, des données par boutique.** Un même numéro peut acheter dans deux boutiques. Chaque commerçant ne voit que « ses » clients (table `clients` par boutique).
- **Identifiants PSP et livreurs** : chiffrés par boutique (Supabase Vault). Jamais visibles en clair dans le backoffice après leur saisie.

### 5.4 Abus de la plateforme

- **Vérification légère de l'identité des commerçants** (KYC : CIN, RNE ou matricule fiscal) avant de pouvoir brancher un domaine personnalisé ou un paiement en ligne.
- **Défi anti-robots** (Cloudflare Turnstile) à l'inscription et au paiement. Limite de commandes par téléphone et par IP contre les fausses commandes COD.
- **Signalement et retrait.** Procédure écrite, délai de traitement, trace dans le journal d'audit.
- **Journal d'audit** de toutes les actions sensibles : rôles, réglages, remboursements, exports, suppressions, accès du support.

### 5.5 Liste de contrôle avant d'ouvrir l'inscription au public

- [ ] Tests d'isolation pgTAP verts sur toutes les tables et fonctions
- [ ] Aucune clé `service_role` accessible au navigateur ; revue de toutes les fonctions `SECURITY DEFINER`
- [ ] Double authentification obligatoire pour les administrateurs de boutique
- [ ] Domaine des vitrines séparé, demande d'inscription à la Public Suffix List déposée
- [ ] Façade : pas de cache sur les réponses authentifiées (test automatique)
- [ ] Turnstile et limites de débit actifs sur l'inscription, la connexion, le paiement
- [ ] Identifiants PSP et livreurs chiffrés
- [ ] Journal d'audit actif
- [ ] Sauvegarde hors fournisseur + exercice de restauration réussi
- [ ] Autorisation de l'INPDP pour le transfert des données vers la France déposée, obtenue si possible (voir le PRD, §9)
- [ ] Procédure d'incident et de notification écrite

---

## 6. Exploiter avec une équipe minuscule

### 6.1 Voir

| Besoin | Outil (proposition) | Coût |
|---|---|---|
| Erreurs applicatives | Sentry | Offre gratuite au début |
| Journaux et métriques | Vercel, Cloudflare, Supabase (tableau de bord et métriques exportables) | Inclus |
| Sondes externes + page de statut | OpenStatus ou Better Stack | Offre gratuite ou modeste au début |
| **Parcours d'achat synthétique** : une commande test toutes les 5 min, par cellule, sur une boutique interne | Script planifié | Quasi nul |

### 6.2 Réagir

- **Indicateurs de service (SLO) par cellule et par composant**, avec des alertes sur le taux d'erreur et la latence, pas sur chaque incident isolé.
- **Qui répond.** L'agent d'exploitation trie, applique le runbook et prévient. **Skander décide** dès qu'il faut choisir entre deux mauvaises options (restaurer ou attendre, suspendre une boutique, communiquer). Les alertes critiques arrivent sur son téléphone.
- **Runbooks à écrire avant l'étape 3** :
  - base indisponible ;
  - déploiement cassé ;
  - migration ratée ;
  - carte refusée chez un fournisseur ;
  - PSP gelé ;
  - API d'un livreur hors service ;
  - boutique frauduleuse ;
  - suspicion de fuite de données ;
  - restauration d'une seule boutique ;
  - pic annoncé (Ramadan, soldes).
- **Rapport hebdomadaire automatique** : disponibilité, incidents, coûts, consommation du plafond CTI, sauvegardes testées.

### 6.3 Prouver

- **Test de charge** (k6) avant l'étape 4 puis chaque trimestre. Scénarios :
  1. journée type à l'horizon visé ;
  2. post viral sur une boutique (×100 en 5 minutes) ;
  3. 500 commandes sur une même variante ;
  4. robots sur la recherche.

  Critère de réussite : les autres boutiques ne ralentissent pas de plus de 20 %.
- **Exercice de panne** (*chaos day*) avant l'étape 4 puis chaque semestre, sur la cellule interne :
  1. couper l'application ;
  2. couper la base ;
  3. vérifier que les vitrines répondent et que les commandes passent en tampon ;
  4. vérifier que le rejeu est complet.

---

## 7. Coûts et contrainte de change

### 7.1 Ordre de grandeur mensuel (USD, hors SMS et WhatsApp refacturés)

Tous ces montants sont **à reconfirmer** sur les grilles officielles au moment de choisir. Ce sont des ordres de grandeur pour décider, pas un budget.

| Poste | Lancement (≤ 100 boutiques) | 1 000 boutiques | 10 000 boutiques |
|---|---|---|---|
| Vercel (Pro, 1-3 sièges + usage) | 20-60 | 100-400 | 1 000-4 000 (Enterprise probable) |
| Supabase (Pro + calcul + PITR) | 30-150 | 250-600 | 2 000-6 000 (4-6 cellules) |
| Cloudflare (Workers, R2, Images, for SaaS) | 5-40 | 100-300 | 1 000-3 000 |
| Observabilité et page de statut | 0-30 | 50-150 | 300-1 000 |
| **Total** | **≈ 60-200** | **≈ 500-1 500** | **≈ 5 000-15 000** |

**Pourquoi Cloudflare et R2 devant, en un chiffre.** À 1 000 boutiques, on transfère environ 26 To par mois (§1.2). L'offre Vercel Pro inclut environ 1 To, puis facture le transfert au Go (ordre de 0,15 $/Go, **à reconfirmer**). Servir les images et les pages directement depuis Vercel coûterait donc de l'ordre de **3 500 $ par mois rien qu'en bande passante**. C'est davantage que tout le plafond annuel de la CTI d'une société. Avec R2 (sans frais de sortie) et le cache Cloudflare, ce poste devient marginal.

### 7.2 Le plafond de change, contrainte dure

| Plafond annuel de paiement à l'étranger (CTI) | TND/an | ≈ USD/an (1 $ = 2,9508 TND, BCT, 24/09/2026) | Suffisant jusqu'à… |
|---|---|---|---|
| Société sans label | 10 000 | ≈ 3 390 | Le lancement (≤ 100-300 boutiques) |
| Société labellisée Startup Act | 100 000 | ≈ 33 900 | Environ 2 000-3 000 boutiques |
| Au-delà | Compte startup en devises, alimenté par des apports en devises (levée de fonds, recettes en devises) | — | 10 000 boutiques |

Sources : [ministère des Technologies, CTI](https://www.mtc.gov.tn/fileadmin/Investisseurs/Carte_technologique_Internationale_CTI_-version_francaise.pdf), [BCT, comptes startup en devises](https://www.agenceecofin.com/regulation/1110-60766-tunisie-la-banque-centrale-autorise-les-entreprises-technologiques-ayant-le-label-de-start-up-a-gerer-librement-leurs-comptes-en-devises).

**Ce qui se passe en cas d'impayé** (vérifié dans la doc des fournisseurs) :
- **Supabase** met les projets en pause ([FAQ facturation](https://supabase.com/docs/guides/platform/billing-faq)).
- **Vercel** met les déploiements en pause au bout de 14 jours ([doc](https://vercel.com/docs/plans/pro-plan/billing)).
- **Cloudflare** repasse en offre gratuite au bout de 5 jours ([doc](https://developers.cloudflare.com/billing/troubleshoot/troubleshoot-failed-payments/)).

**Parades, à mettre en place avant l'étape 2 :**
1. **Déposer la demande de label Startup Act.**
2. **Prépayer des crédits Supabase** pour plus de 3 mois. Les recharges vont jusqu'à 2 000 $, n'expirent pas et sont consommées avant la carte ([doc](https://supabase.com/docs/guides/platform/credits)).
3. **Enregistrer deux cartes CTI de deux banques différentes** chez chaque fournisseur, testées avec un petit montant.
4. **Tenir un calendrier des échéances et du plafond consommé**, avec une alerte à 70 %.
5. **Écrire la procédure « carte refusée ».**
6. **Garder en réserve une option d'hébergement en Tunisie**, payée en dinars, pour une partie des services : instantanés, sauvegardes, voire données personnelles si l'INPDP l'exige. L'architecture le permet parce que les couches sont séparées.

**Le rapport coût/revenu reste sain**, à titre d'illustration seulement. Avec les fourchettes de prix *non validées* de l'étude de marché, l'abonnement moyen tourne autour de 107 TND par mois (répartition 70/25/5). À 1 000 boutiques, cela fait environ 107 000 TND par mois, soit environ 36 000 $. L'infrastructure pèse alors 1,5 à 4 % du revenu. **Le problème n'est pas le montant, c'est la possibilité légale de payer.**

---

## 8. Options étudiées

| Critère | **A. Cloudflare en façade + Vercel + Supabase (reco)** | B. Tout Vercel + Supabase | C. Tout Cloudflare (Workers) + Supabase |
|---|---|---|---|
| Vitrine si la base tombe | Oui (cache, instantanés) | Oui pour les pages déjà générées : Next.js garde la dernière version si la régénération échoue | Oui |
| Vitrine si l'hébergeur de l'application tombe | **Oui** (façade indépendante de Vercel) | Non | Façade et application chez le même fournisseur |
| Commandes si la base tombe | Oui (tampon en bordure) | Partiel (Vercel Queues, si Vercel est vivant) | Oui |
| Bande passante (images, pages) | Faible (cache + R2) | **Élevée au-delà du forfait** | Faible |
| Compatibilité avec le code Maymar (Next.js 16) | Totale | Totale | **Risquée.** Cloudflare recommande désormais *vinext*, une réimplémentation de Next.js sur Vite, pour les nouvelles apps ; OpenNext reste pour l'existant ([doc](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/)) |
| Fournisseurs à payer en dollars | 3 | 2 | 2 |
| Complexité à maintenir | Moyenne (un Worker de façade) | Faible | Moyenne à forte |
| Ce qui est réversible | L'application peut passer de Vercel à Workers plus tard sans toucher aux domaines clients | Changer de façade plus tard = migrer tous les domaines clients | — |

**Pourquoi A.**
- C'est la seule option qui répond aux **deux** exigences, y compris quand l'hébergeur de l'application tombe.
- Elle maîtrise le poste de coût qui explose en premier, la bande passante.
- Elle place le choix irréversible, les domaines des clients, chez l'acteur le plus solide sur ce métier.

**À vérifier en prototype (étape 1).**
- Vercel ne recommande pas de mettre un proxy devant ses déploiements (pare-feu, cache, visibilité). Il faut mesurer l'effet réel et verrouiller l'accès direct à l'origine par un en-tête secret.
- Il faut confirmer si un domaine *wildcard* sur Vercel impose les serveurs DNS de Vercel. Avec la façade Cloudflare, le *wildcard* est porté par Cloudflare et la question disparaît.

---

## 9. Ce qu'on construit, et quand

Les étapes correspondent à la feuille de route du PRD.

| Étape | Infrastructure livrée | Preuve de fin |
|---|---|---|
| **1. Socle** | Modèle multi-boutique (`boutique_id`, FK composites, RLS), tests d'isolation en CI, annuaire, Worker de façade v1 (routage, cache, en-têtes réécrits, `stale-if-error`), images sur R2, outbox + files, export quotidien hors fournisseur, Sentry | Deux boutiques de test isolées, tests verts ; application coupée → vitrines toujours servies |
| **2. Maymar en ligne** | Instantanés R2 + page de secours, tampon de commandes et rejeu, page de statut, parcours synthétique, premier exercice de restauration, parades de change en place | De vraies commandes livrées ; exercice de panne réussi sur la cellule interne |
| **3. Bêta privée** | Limites par boutique et quotas par offre, Turnstile, KYC léger, runbooks, PITR | 10-20 commerçants, aucune fuite, SLO tenus pendant 1 mois |
| **4. Lancement public** | Domaines personnalisés (Cloudflare for SaaS), domaine des vitrines sur la Public Suffix List, test de charge au pic, exercice de panne, liste de contrôle du §5.5 complète | Test de charge réussi ; label Startup déposé ; INPDP déposé |
| **5. Entreprises** | Réplica en lecture pour le backoffice et les statistiques, cellule dédiée sur demande, API publique à débit limité, webhooks signés | Un client établi en production |

---

## 10. Questions ouvertes et points à vérifier

1. **Vercel derrière Cloudflare** : coût réel, pare-feu, verrouillage de l'origine. À prototyper.
2. **Tampon de commandes** : Durable Objects ou Queues ? Temps de rejeu mesuré ? À prototyper.
3. **Grilles tarifaires exactes** (Vercel, Supabase, PITR, Cloudflare Images) au moment de l'achat.
4. **Taille réelle d'une cellule** : à calibrer par test de charge sur les données de Maymar.
5. **Hébergement tunisien de repli** (données personnelles, sauvegardes) : quels fournisseurs, quel prix en TND ? Utile si l'INPDP refuse ou durcit les conditions.
6. **Réévaluation multi-CDN** à 1 000 boutiques.

## Sources principales

- Étude marché et écosystème du 28/09/2026 (extraits dans `01-prd-v0.md` et `04-risques-et-decisions.md`)
- Cloudflare : [Cache-Control et stale-if-error](https://developers.cloudflare.com/cache/concepts/cache-control/), [Workers Cache](https://developers.cloudflare.com/workers/cache/configuration/), [Cloudflare for SaaS, offres](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/), [OpenNext et vinext](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/), [impayés](https://developers.cloudflare.com/billing/troubleshoot/troubleshoot-failed-payments/)
- Vercel : [en-têtes de cache](https://vercel.com/docs/caching/cache-control-headers), [plateformes multi-boutiques](https://vercel.com/docs/platforms/multi-tenant-platforms/quickstart), [facturation Pro](https://vercel.com/docs/plans/pro-plan/billing)
- Supabase : [connexions et poolers](https://supabase.com/docs/guides/database/connecting-to-postgres), [FAQ facturation](https://supabase.com/docs/guides/platform/billing-faq), [crédits](https://supabase.com/docs/guides/platform/credits)
- Shopify, architecture en *pods* : blog d'ingénierie de Shopify (« A Pods Architecture to Allow Shopify to Scale »)
