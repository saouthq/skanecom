# 06 — La facturation des clients SkanEcom, par SkanFact

*01/10/2026. Décision D20 (Skander) : « on pourrait utiliser mon logiciel afin de faire ça avec une API, et
éviter de refaire le même métier sur cette app ». L'API de SkanFact a été lue ce jour-là dans
`saouthq/skanfact-plateforme` (commit `7f2bf79`), en lecture seule.*

**La règle.** Les factures des clients de SkanEcom (mise en place, abonnement, options), leurs
encaissements, la TVA, le timbre, la retenue à la source, la facture électronique (El Fatoora) et la
comptabilité vivent dans **SkanFact**. SkanEcom n'en refait rien. La console lit la situation de chaque
client dans SkanFact et la montre là où l'on pilote les boutiques ; elle ne facture pas, n'encaisse pas,
ne calcule aucune taxe.

---

## 1. Qui fait quoi

| SkanFact (la vérité) | SkanEcom, la console |
|---|---|
| La société cliente : raison sociale, matricule fiscal, adresse | Le lien entre une boutique et son client SkanFact |
| Les factures (mise en place, chaque mois d'abonnement, options), leur numéro, leur fichier TEIF, l'envoi à la TTN | La lecture : factures, échéance, montant, reste à payer |
| Les règlements (virement, chèque, espèces, en ligne), la retenue à la source, les avoirs, les relances | « À jour », « à régler », « en retard de 12 jours » ; le dernier règlement |
| La comptabilité, la TVA du mois | Rien |
| L'abonnement : le prix, le début, l'engagement, la fin (quand les factures périodiques existeront, § 3) | L'offre et les modules de la boutique (déjà dans la console) |

La console ne touche jamais seule à une boutique pour un impayé (pas de suspension automatique) : elle le
dit, Skander décide.

---

## 2. Ce que l'API de SkanFact sait déjà faire (lu le 01/10/2026)

- **L'accès** : une clé par entreprise, `Authorization: Bearer skf_…`. Elle porte une liste de gestes (jamais
  plus que les droits de qui l'a créée), n'est montrée qu'une fois, expire au plus tard au bout de 366 jours,
  se révoque, et ses appels sont limités (en-têtes `ratelimit-limit`, `ratelimit-remaining`, `retry-after`).
  Les montants entrent et sortent **en texte exact** (« 250.000 »), jamais en nombre à virgule.
- **Les clients** : `POST /v1/entreprises/:entreprise/clients` (raison sociale, nature, identifiant et son
  type — le matricule —, adresse, pays, e-mail, téléphone) rend l'identifiant du client ;
  `GET /v1/entreprises/:entreprise/clients` les liste par ordre alphabétique, page par page (curseur `apres`).
- **Les factures** : `POST /v1/entreprises/:entreprise/ventes` crée un brouillon (type, client, date,
  échéance, lignes avec désignation, quantité, prix, taux de TVA ; taux de retenue ; timbre ; objet) ;
  `POST …/ventes/:piece/emettre` l'émet (numéro, scellement, fichier TEIF si l'entreprise est soumise) ;
  `GET …/ventes?type=facture` les liste, la plus récente d'abord, avec le net à payer et **le reste à payer**
  (règlements et avoirs retranchés) ; `GET …/ventes/:piece` lit une pièce.
- **Les avis** (webhooks) : signés (`skanfact-signature: t=…,v1=…`, HMAC-SHA256 de « t.corps »), vers une
  adresse https publique seulement. **Un seul événement aujourd'hui : `facture.emise`.**
- **La documentation** : `GET /v1/documentation` (OpenAPI, écrite depuis les routes).
- **Fermé aux clés, par choix de SkanFact** : enregistrer un règlement, partager le lien d'espace client
  d'une facture, signer et envoyer à la TTN. Cela se fait dans SkanFact, par une personne. Pour SkanEcom,
  c'est très bien : l'argent se traite dans SkanFact.

---

## 3. Ce qu'il manque à SkanEcom — à demander à SkanFact

Par ordre de priorité. Le **P1** suffit à la première version de la console ; le **P2** fait les abonnements.

### P1 — lire la situation d'un client

1. **Les factures d'un client** : `GET …/ventes?type=facture&client=<id du client>`, et un filtre
   `reste=non_nul` (seulement ce qui reste à payer). Chaque ligne avec son **échéance** (`echeance`), pour
   dire « en retard de 12 jours » : la liste d'aujourd'hui ne la donne pas.
2. **La situation d'un client en un appel** : `GET …/clients/:client` → sa fiche, et son encours : le reste à
   payer en tout, dont ce qui est échu, la plus vieille échéance dépassée, le dernier règlement (date,
   montant). L'encours existe déjà dans le moteur (`encoursClient`, brique 91).
3. **Retrouver un client par son matricule** : `GET …/clients?identifiant=…`, pour que la console ne crée pas
   un doublon d'un client qui existe déjà.
4. **Des événements de plus** pour les avis : `reglement.enregistre` (la facture, le montant, la retenue, le
   reste), `facture.reglee` (reste à zéro), `avoir.emis` ; et, si possible, `facture.echue` (le jour où une
   échéance passe sans règlement complet). Sans eux, la console doit relire à intervalles.
5. **L'adresse de l'écran** dans chaque réponse (une facture, un client) : un champ `lien` vers l'écran de
   SkanFact, pour un bouton « Ouvrir dans SkanFact ».

### P2 — les factures périodiques (l'abonnement)

6. **Un modèle de facture qui revient** : un client, ses lignes, le jour du mois, l'échéance (à J+N), la
   retenue, le timbre, un début, une fin (ou aucune) ; il s'émet seul chaque mois, se suspend, reprend,
   s'arrête, et son prix change pour les mois suivants. Par l'API : créer, lire, suspendre, reprendre,
   arrêter, changer le prix ; et la facture émise dit de quel modèle elle vient. Utile à tous les clients
   de SkanFact (abonnements, loyers, contrats de maintenance), pas seulement à SkanEcom.
7. *(À trancher par Skander.)* Ouvrir à une clé la création du lien d'espace client d'une facture
   (`POST …/espace/liens`, fermé aux clés aujourd'hui), pour que SkanEcom puisse envoyer à son client
   « votre facture, à régler ici ».

### La réponse de SkanFact (01/10/2026)

D'accord sur le partage : les factures se font dans SkanFact, la console les lit. **Le P1 est en
construction**, aux adresses suivantes (les noms exacts des champs viendront à la publication de chaque
brique) :

1. `GET /v1/entreprises/{id}/ventes?client=…&aPayer=1`, avec l'échéance de chaque facture ;
2. `GET …/clients/{client}/situation` : reste dû, dont échu, retard, dernier règlement ;
3. `GET …/clients?identifiant=…` : retrouver un client par son matricule ;
4. les événements `reglement.enregistre` et `facture.reglee`, en plus de `facture.emise` (abonnement aux
   avis : `POST …/avis-abonnements`, avis signés) ;
5. un lien `ecran` dans les réponses, vers la facture ou le client dans SkanFact.

Puis le P2 : les factures périodiques émises par le serveur. La signature électronique et l'envoi à la TTN
restent un geste humain dans SkanFact. `avoir.emis` et `facture.echue` ne sont pas annoncés : la console
relira la situation d'un client à l'ouverture de sa page et à chaque avis reçu.

---

## 4. Ce que fera la console SkanEcom

- **La configuration de la plateforme**, en secrets du Worker (posés par Skander, jamais dans le dépôt ni
  dans le navigateur) : l'adresse de SkanFact, l'identifiant de l'entreprise SkanEcom dans SkanFact, la clé
  de l'API, le secret des avis.
- **Le lien d'une boutique à son client SkanFact** : retrouver le client par son matricule, ou le créer à
  partir des informations légales que la boutique a déjà saisies au backoffice (Réglages → Informations
  légales : raison sociale, matricule fiscal, siège, e-mail). Le lien est tracé au journal de la console.
- **Un onglet « Facturation »** dans chaque boutique : la situation (à jour, à régler, en retard de N jours),
  les factures (numéro, date, échéance, montant, reste), le dernier règlement, « Ouvrir dans SkanFact ».
- **L'accueil de la console** : dans la synthèse, ce qui reste à encaisser et ce qui est en retard ; dans
  « À surveiller », un client en retard de plus de 15 jours, une boutique ouverte sans client SkanFact, la
  clé de l'API qui expire dans 30 jours.
- **Jamais bloquante** : lue à chaque ouverture de l'onglet et à chaque avis, la dernière lecture gardée. Si
  SkanFact ne répond pas, la console le dit et montre la dernière situation connue, avec son heure.
- **Les avis reçus** sont vérifiés (signature, horodatage de moins de cinq minutes) et rejouables sans effet
  double.
- **Les boutiques de démonstration** (Maison Selma, Dar Alia, Yasmine Beauté, la Quincaillerie du Sud),
  marquées comme telles dans la console depuis le 01/10 (migration 78), n'ont pas de client SkanFact.

La clé de SkanEcom ne porte que les gestes nécessaires : `ventes.pieces.voir` (lire) et
`ventes.client.modifier` (créer un client). Pas l'émission : c'est SkanFact qui facture.

*(Précisé par SkanFact le 01/10 : la clé n'a que `ventes.pieces.voir` ; le client se crée dans SkanFact.)*

---

## 4 bis. Ce qui est branché (01/10/2026, brique 127 de SkanFact)

Lu dans `docs/api-situation.md` de la plateforme (S1 à S5) et `serveur/avis.ts` (la signature des avis).

| Côté SkanEcom | Fichiers |
|---|---|
| Le lien boutique ↔ client SkanFact, tracé (`facturation.lier`, `facturation.delier`) ; jamais pour une démonstration ; la dernière situation lue, gardée telle quelle avec son heure ; les avis déjà reçus | migration 79, `supabase/tests/79_facturation_skanfact.sql` |
| La lecture : S1 le client par son matricule, S2 ses factures à payer (page par page, cinq pages de 200 au plus), S3 sa situation, S5 le lien vers l'écran (relatif, préfixé de `SKANFACT_URL`, jamais une autre adresse) ; six secondes au plus par appel ; les montants restent du texte | `application/src/lib/console/skanfact.ts` |
| L'onglet **Facturation** de chaque boutique : chercher le client (le matricule déclaré dans ses mentions légales pré-rempli), le relier (son nom et son matricule relus dans SkanFact), la situation par devise, le retard, le dernier règlement, les factures à payer, les liens vers SkanFact, délier ; SkanFact injoignable : la dernière lecture, avec son heure | `app/_console/(protegee)/boutiques/[slug]/facturation/` |
| Les avis : `POST https://<console>/crochets/skanfact`, signature `t=…,v1=…` vérifiée (cinq minutes au plus), puis la situation du client relue et gardée ; rejoué : sans effet double ; SkanFact injoignable : 502, SkanFact renverra l'avis. Les trois événements (`facture.emise`, `reglement.enregistre`, `facture.reglee`, quel que soit son `par`) font la même chose : relire | `app/_console/crochets/skanfact/route.ts`, `lib/console/avis-skanfact.ts` |
| « À surveiller » (accueil) : une facture échue depuis plus de **15 jours** (comptés depuis son échéance, sans relire SkanFact), une boutique ouverte sans client SkanFact (quand SkanFact est branché) | `lib/console/pilotage.ts` |
| SkanFact simulé en local et en CI (entreprise, clé, secret de développement ; deux clients fictifs ; régler, émettre, panne) | `outils/skanfact-dev.mjs`, `outils/api-locale.sh` |

**Les secrets du Worker** (posés par Skander) : `SKANFACT_URL` (l'adresse de SkanFact), `SKANFACT_ENTREPRISE`
(l'identifiant de l'entreprise SkanEcom), `SKANFACT_CLE` (une clé de cette entreprise, geste
`ventes.pieces.voir` seulement), `SKANFACT_AVIS_SECRET` (le secret rendu par l'abonnement aux avis). Déclarés
dans `cloudflare.config.ts`, donc exigés au déploiement : l'aperçu en ligne reçoit « aucune » (SkanFact non
branché) quand ils manquent, sans écraser une valeur posée à la main.

**Le geste à faire une fois dans SkanFact**, par une personne (pas par la clé) : l'abonnement aux avis,
`POST /v1/entreprises/:e/avis-abonnements` avec `{"url":"https://<console>/crochets/skanfact","evenements":["facture.emise","reglement.enregistre","facture.reglee"]}` ;
son secret va dans `SKANFACT_AVIS_SECRET`.

**L'abonnement mensuel** de chaque boutique : un contrat « Émise seule » par boutique, dans l'entreprise
SkanEcom, créé **à l'écran de SkanFact** (pas encore par l'API) ; ses factures arrivent ensuite dans la console
par l'avis `facture.emise`.

**Pas encore** : la synthèse « reste à encaisser » de l'accueil, l'expiration de la clé, la création du client
depuis la console (la clé ne crée rien), le lien d'espace client (§ 3.7).

---

## 5. À trancher par Skander

- **L'entreprise qui facture** : SkanEcom est-elle une entreprise à part dans SkanFact (sa raison sociale,
  son matricule) ?
- **Le seuil du retard** à surveiller : 15 jours après l'échéance ?
- **Maymar**, « au prix coûtant » (D5) : facturée dans SkanFact, ou sans facture ?
- **Le § 3.7** : le lien d'espace client ouvert à une clé, ou non.

---

## 6. Le message pour la session qui développe SkanFact

> SkanEcom va lire, par l'API de SkanFact, la situation de ses clients (les boutiques qu'il héberge). Ce qui
> existe suffit à créer un client et à lister les factures avec leur reste à payer. Il manque, par priorité :
> (1) filtrer les factures par client et par reste non nul, avec l'échéance dans chaque ligne ;
> (2) `GET /clients/:client` avec l'encours (reste total, dont échu, plus vieille échéance dépassée, dernier
> règlement) ; (3) chercher un client par identifiant ; (4) les avis `reglement.enregistre`,
> `facture.reglee`, `avoir.emis`, et si possible `facture.echue` ; (5) un champ `lien` vers l'écran. Puis (6)
> les factures périodiques, avec leur API (créer, lire, suspendre, reprendre, arrêter, changer le prix).
> Les montants restent en texte exact, les gestes des clés inchangés : SkanEcom n'a besoin que de
> `ventes.pieces.voir` et `ventes.client.modifier`.
