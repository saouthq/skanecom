# L'aperçu en ligne

Les boutiques de démo et la console, sur des adresses que l'on ouvre depuis
n'importe quel ordinateur ou téléphone, mises à jour à chaque envoi de code
(workflow `.github/workflows/apercu.yml`).

| | Adresse |
|---|---|
| Maymar | `https://skanecom-apercu-maymar.<sous-domaine>.workers.dev` |
| Maison Selma | `https://skanecom-apercu-selma.<sous-domaine>.workers.dev` |
| Quincaillerie du Sud | `https://skanecom-apercu-quincaillerie.<sous-domaine>.workers.dev` |
| Yasmine Beauté | `https://skanecom-apercu-beaute.<sous-domaine>.workers.dev` |
| Dar Alia | `https://skanecom-apercu-maison.<sous-domaine>.workers.dev` |
| Console et backoffices | `https://skanecom-apercu-console.<sous-domaine>.workers.dev` |

Le résumé de chaque exécution du workflow donne les adresses exactes.

## Comment c'est organisé

- **Une organisation Supabase « SkanEcom »**, et dedans **un projet par
  usage, jamais un par boutique** : toutes les boutiques vivent dans la même
  base, séparées par la base elle-même (règles d'accès ligne par ligne,
  vérifiées par les tests pgTAP).
  - `skanecom-apercu` (réf. `cxvbjwduaisdkvtfjxph`, Paris `eu-west-3`,
    créé le 30/09) : les boutiques de démo. L'organisation est au plan Pro.
  - `skanecom-prod` : les vrais clients, créé avant le premier.
- **La base suit le code** : à chaque exécution, le workflow envoie les
  migrations à la fonction `apercu-installer` du projet, qui joue les
  nouvelles, le jeu de démo la première fois seulement, et
  `supabase/apercu/codes-demo.sql`.
- **Cloudflare** : une seule application (`skanecom-application`) ; devant
  elle, un petit routeur par adresse (`outils/apercu/routeur.js`), qui ne
  change rien à la requête. Les photos sont dans le bucket R2
  `skanecom-fichiers`.
- **Ni SMS ni e-mail ne partent de l'aperçu** : les codes de connexion sont
  notés dans la base (`supabase/apercu/codes-demo.sql`) et la console les
  affiche, une heure, sur sa page d'accueil. Les e-mails, rédigés par
  l'application aux couleurs de la boutique (secret `COURRIELS_ENVOI` =
  `apercu`), y sont gardés entiers : « Voir l'e-mail » les montre tels
  qu'ils seraient partis.
- **Après chaque déploiement, un navigateur contrôle l'aperçu** : l'accueil,
  le catalogue et une fiche de chaque boutique, sur ordinateur et téléphone
  — polices chargées, images cassées, réponses en erreur (résumé du
  workflow), et une capture de chaque page (artefact « apercu-en-ligne »).

## La mise en place, une fois

À faire par Skander (dans cet ordre) :

1. Sur supabase.com : créer l'organisation **SkanEcom** (plan gratuit).
2. Sur claude.ai → Paramètres → Connecteurs → Supabase : autoriser cette
   organisation.

Claude, ensuite, depuis sa session :

3. crée le projet `skanecom-apercu` (région Paris, `eu-west-3`) — fait le 30/09 ;
4. met l'adresse du projet et sa clé publique dans le workflow — fait.

De nouveau Skander, une fois, dans GitHub → dépôt skanecom → Settings →
Secrets and variables → Actions → New repository secret (ne jamais les
donner à personne, ni les coller dans une conversation) :

5. `APERCU_SUPABASE_SERVICE_ROLE_KEY` : la clé `service_role` du projet
   (Project Settings → API Keys → Legacy API Keys) — fait le 30/09.
6. `SUPABASE_ACCESS_TOKEN` : un jeton d'accès de son compte Supabase
   (avatar → Account preferences → Access Tokens → Generate new token).

Le workflow fait ensuite tout, à chaque exécution :

- la base : les migrations envoyées à la fonction `apercu-installer`
  (`supabase/functions/apercu-installer`, déployée par Claude, protégée par
  la clé `service_role`), le jeu de démo une fois, les crochets des codes ;
- l'authentification, par l'API de gestion de Supabase : crochet « Send
  SMS » vers `private.crochet_sms_apercu`, crochet « Send Email » vers
  l'application (`/crochets/courriel` sur l'adresse de la console, signé par
  un secret dérivé de la clé `service_role`, jamais écrit nulle part),
  connexion par téléphone, adresse de la console et adresses de retour,
  codes à six chiffres valables 24 heures ;
- l'administrateur (`APERCU_ADMIN_EMAIL`) : invité par un vrai e-mail
  (`supabase/apercu/invitation.html`, envoyé par le serveur d'e-mails de
  Supabase, réservé aux membres de l'organisation) s'il n'a pas de compte,
  puis inscrit dans `plateforme.administrateurs`. Lien périmé : relancer le
  workflow avec « Renvoyer l'invitation ». La double authentification se
  règle à la première connexion à la console ;
- SkanFact : « aucune » pour les secrets de la facturation des clients
  tant que Skander ne les pose pas ; le chiffrement des clés des commerçants
  (`SKANFACT_CHIFFRE`) et le secret de SkanEcom chez SkanFact
  (`SKANFACT_SECRET`, 32 octets) tirés au hasard UNE fois, jamais écrits
  nulle part. Le résumé de l'exécution qui tire le secret en donne
  l'empreinte (SHA-256) ; chaque exécution redonne l'adresse de retour. La
  console les redit (une boutique → Modules → Facturation SkanFact →
  « SkanEcom chez SkanFact ») : c'est ce que SkanFact déclare.

Le jeton Cloudflare du dépôt (ajouté le 29/09) expire fin octobre : le
renouveler avec le modèle « Edit Cloudflare Workers ».
