# SkanEcom — Décisions et risques (v0)

> Statut : **à trancher par Skander**. Rédigé le 28/09/2026.
> Chaque décision porte une recommandation. Une fois tranchée, on la note ici avec sa date. On ne la re-débat plus sans fait nouveau.

---

## 1. Décisions déjà prises

| Date | Décision | Par |
|---|---|---|
| 28/09/2026 | Plateforme e-commerce multi-boutique **en autonomie** (self-service), « type Shopify » | Skander |
| 28/09/2026 | Marché **tunisien** d'abord | Skander |
| 28/09/2026 | Cibles : **petits vendeurs ET entreprises établies** | Skander |
| 28/09/2026 | Nom : **SkanEcom** | Skander |
| 28/09/2026 | **Maymar est le client n°1** | Skander |
| 28/09/2026 | Avant la v1, **cadrage de l'infrastructure** : tenir la charge, rester ouvert en cas de panne | Skander |
| 28/09/2026 | **D1 — Hébergement : Cloudflare pour tout ce qui sert et calcule (façade, application Next.js sur Workers, R2, files), Supabase pour les données.** Vercel n'est gardé qu'en plan B si le prototype Next.js sur Workers échoue (`02-infrastructure.md`, §8) | Skander |
| 28/09/2026 | **D2 — Domaine des vitrines gratuites** : un domaine dédié, séparé de `skanecom.tn` et inscrit sur la Public Suffix List. `skanecom.tn` porte le site commercial et le backoffice. Nom du domaine des vitrines à choisir | Skander |

## 2. Décisions à trancher

| # | Question | Options | Recommandation | Pourquoi |
|---|---|---|---|---|
| D3 | **Commission sur les ventes** | 0 % · 0,3 % façon Converty · à la commande livrée | **0 %** | Difficile à encaisser sur du COD ; argument commercial face à Converty et YouCan |
| D4 | **Ordre d'acquisition** | Établis d'abord · petits d'abord · les deux en même temps | **Établis et vendeurs à volume d'abord ; Starter dès le lancement, sans gratuit** | Ils paient, ont le plus mal (agences, refus), et sont peu nombreux : ça convient à l'équipe |
| D5 | **Prix des paliers** | Fourchettes Starter 39-59, Pro 149-199, Business 399-790 TND/mois | **Valider par 10 à 15 entretiens** avant de fixer | Aucun prix n'est validé par le marché |
| D6 | **Installation assistée payante** | Oui · non | **Oui** (490 à 1 990 TND, à tester) | Le goulot des entreprises établies est le contenu ; c'est un revenu immédiat |
| D7 | **Durée de l'essai gratuit** | 14 · 30 · 60 jours (Mallatech : 60) | **30 jours** | Assez pour une première commande livrée |
| D8 | **Label Startup Act** | Déposer maintenant · plus tard | **Maintenant** | Sans lui, le plafond de paiement à l'étranger (10 000 TND/an) bloque l'infrastructure dès quelques centaines de boutiques |
| D9 | **Démarche INPDP** (transfert des données vers la France) | Maintenant · avant la bêta | **Préparer maintenant, déposer avant la 1re boutique tierce** (étape 3) | Risque pénal ; silence au-delà d'un mois = refus |
| D10 | **Accompagnement juridique et comptable** | Avocat et comptable dès maintenant · plus tard | **Dès maintenant, sur des questions ciblées** (INPDP, BCT, TVA et retenues, TTN) | Plusieurs points sont bloquants et hors de notre compétence |
| D11 | **Identité visuelle SkanEcom** | Confier à Noah et Lina · autre | **Noah (identité) + Lina (design)**, comme pour Maymar | Même exigence : « le plus beau site qu'on ait fait » |
| D12 | **Premiers transporteurs à intégrer** | Intigo, First Delivery, Navex, Aramex, Rapid-Poste… | **3 à 5, choisis avec les premiers commerçants** | Les API sont hétérogènes ; mieux vaut intégrer ceux que les clients utilisent déjà |
| D13 | **Nouveau repo et nouveau projet Supabase** | Réutiliser le projet Supabase de Maymar · en créer un | **Nouveau projet** (cellule 1) ; Maymar y est migré | Schéma incompatible (mono-boutique) ; on repart propre |

## 3. Registre des risques

| # | Risque | Probabilité | Impact | Parade | Étape |
|---|---|---|---|---|---|
| R1 | **Carte refusée ou plafond CTI atteint** → Supabase en pause, Cloudflare en offre gratuite à J+5 : **toutes les boutiques tombent** | Élevée sans label, dès quelques centaines de boutiques | Critique | Label Startup Act, crédits Supabase prépayés (> 3 mois), 2 cartes de 2 banques, alertes à 70 % du plafond, procédure écrite | 0-2 |
| R2 | **Guerre des prix** (Converty, e-Tijara gratuits) | Élevée | Élevé | Vendre des résultats chiffrés (refus évités, disponibilité, image de marque), pas des fonctions ; cibler les établis | 0 |
| R3 | **Transfert de données sans autorisation INPDP** | Certaine si rien n'est fait | Élevé (pénal) | Dossier préparé à l'étape 0 et déposé avant l'étape 3 ; avocat ; consentements ; option d'hébergement en Tunisie gardée en réserve | 0-3 |
| R4 | **Fuite de données entre boutiques** | Moyenne sans garde-fous | Critique (confiance) | FK composites, RLS par boutique, tests d'isolation qui bloquent la livraison, cache jamais partagé pour l'authentifié | 1 |
| R5 | **Panne de la base ou de l'application** | Moyenne | Élevé | Façade, 4 filets, tampon de commandes (`02-infrastructure.md`, §4) | 1-2 |
| R6 | **Panne mondiale de Cloudflare** | Faible | Critique | Accepté en v1 ; réévaluation multi-CDN à 1 000 boutiques | 4-5 |
| R7 | **Facture de bande passante qui explose** | Élevée sans cache | Élevé | Images sur R2, pages en cache à la bordure (`02-infrastructure.md`, §7) | 1 |
| R8 | **Gel ou panne d'un prestataire de paiement** (précédent Paymee) | Moyenne | Moyen | Fonds jamais détenus par SkanEcom, plusieurs PSP, disjoncteur, COD toujours disponible | 1-3 |
| R9 | **API de livreurs instables ou limitées** | Élevée | Moyen | Adaptateurs versionnés derrière une file, réessais, bordereau PDF en repli | 3 |
| R10 | **Factures d'abonnement non conformes (TEIF)** | Certaine sans intégration | Moyen (amendes) | Adhésion à TTN et intermédiaire API avant la 1re facture | 4 |
| R11 | **Boutiques frauduleuses sur nos domaines** | Moyenne | Élevé (réputation) | Domaine des vitrines sur la Public Suffix List, KYC léger, signalement et retrait, Turnstile | 3-4 |
| R12 | **Charge de support trop lourde** pour l'équipe | Élevée côté petits vendeurs | Élevé | Assistant d'inscription, documentation FR/AR, support de premier niveau par agents, pas de gratuit en v1 | 3-4 |
| R13 | **Données de marché peu fiables** (écarts ×2 à ×4) | Élevée | Moyen | Entretiens, vraies données de Maymar, scénarios plutôt que prévisions | 0-2 |
| R14 | **Nouvelles lois** (e-commerce 042/2024, données 095/2025, change 115/2025) | Moyenne sur 12 mois | Moyen | Délais légaux et mentions en réglages ; veille automatisée | continu |

## 4. Actions immédiates proposées (étape 0)

| Action | Qui | Coût |
|---|---|---|
| Réserver `skanecom.com` (libre au 28/09/2026, vérifié) et `skanecom.tn` (bureau agréé ATI, ≤ 3 jours ouvrables) ; **choisir et réserver le domaine des vitrines** (D2) | Skander | Quelques dizaines de TND/an |
| Déposer la marque SkanEcom à l'INNORPI | Skander | À vérifier |
| Monter le dossier **Startup Act** | Skander (+ comptable) | — |
| Tester une **CTI société** chez Supabase et Cloudflare avec un petit montant | Skander | Symbolique |
| Préparer le dossier **INPDP** (finalités, données, destinataires, garanties) | Agent + avocat | Honoraires |
| Lister les questions pour l'avocat (INPDP, BCT, circulaire 2026-10) et le comptable (TVA, retenues, TTN) | Agent | — |
| Mener **10 à 15 entretiens** d'entreprises (dont l'associé importateur de Maymar) sur les prix, les douleurs et les livreurs utilisés | Skander + agent | Temps |
| Contacter **Konnect et Flouci** (API pour les plateformes, frais réels) et **Intigo, First Delivery, Navex** (API, reversement du COD) | Agent | — |
| Lancer l'**identité visuelle** SkanEcom (Noah + Lina) | Luna | — |
| Mettre à jour le `CLAUDE.md` du projet et le PRD officiel dans `claude-team` | Luna | — |
