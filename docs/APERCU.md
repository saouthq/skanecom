# L'aperçu en ligne

Les boutiques de démo et la console, sur des adresses que l'on ouvre depuis
n'importe quel ordinateur ou téléphone, mises à jour à chaque envoi de code
(workflow `.github/workflows/apercu.yml`).

| | Adresse |
|---|---|
| Maymar | `https://skanecom-apercu-maymar.<sous-domaine>.workers.dev` |
| Maison Selma | `https://skanecom-apercu-selma.<sous-domaine>.workers.dev` |
| Quincaillerie du Sud | `https://skanecom-apercu-quincaillerie.<sous-domaine>.workers.dev` |
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
- **La base suit le code** : à chaque exécution, le workflow joue les
  migrations nouvelles (`supabase db push`), le jeu de démo la première fois
  seulement, et `supabase/apercu/codes-demo.sql`.
- **Cloudflare** : une seule application (`skanecom-application`) ; devant
  elle, un petit routeur par adresse (`outils/apercu/routeur.js`), qui ne
  change rien à la requête. Les photos sont dans le bucket R2
  `skanecom-fichiers`.
- **Ni SMS ni e-mail ne partent de l'aperçu** : les codes de connexion sont
  notés dans la base (`supabase/apercu/codes-demo.sql`) et la console les
  affiche, une heure, sur sa page d'accueil.

## La mise en place, une fois

À faire par Skander (dans cet ordre) :

1. Sur supabase.com : créer l'organisation **SkanEcom** (plan gratuit).
2. Sur claude.ai → Paramètres → Connecteurs → Supabase : autoriser cette
   organisation.

Claude, ensuite, depuis sa session :

3. crée le projet `skanecom-apercu` (région Paris, `eu-west-3`) — fait le 30/09 ;
4. met l'adresse du projet et sa clé publique dans le workflow — fait.

De nouveau Skander, sur le tableau de bord Supabase du projet, puis dans
GitHub → dépôt skanecom → Settings → Secrets and variables → Actions → New
repository secret (ne jamais les donner à personne, ni les coller dans une
conversation) :

5. **Project Settings → API Keys → Legacy API Keys** : la clé `service_role`
   → secret `APERCU_SUPABASE_SERVICE_ROLE_KEY`.
6. **Project Settings → Database → Reset database password** (le projet a
   été créé avec un mot de passe que personne ne connaît), puis le bouton
   **Connect** en haut → **Session pooler** → la chaîne `postgresql://…`, le
   nouveau mot de passe à la place de `[YOUR-PASSWORD]` → secret
   `APERCU_DB_URL`. Le workflow s'en sert pour installer la base.
7. Relancer le workflow « Aperçu en ligne » (onglet Actions → Run
   workflow) : il installe la base et déploie. Puis, dans Supabase :
   **Authentication → Hooks** : « Send SMS hook » → Postgres →
   `private.crochet_sms_apercu` ; « Send Email hook » → Postgres →
   `private.crochet_email_apercu`.
8. **Authentication → Sign In / Providers** : activer **Phone** (le crochet
   tient lieu de fournisseur) et laisser **Email** actif.
9. **Authentication → URL Configuration** : Site URL = l'adresse de la
   console de l'aperçu ; Redirect URLs = la même, suivie de `/**`.
10. **Authentication → Users → Add user** : son adresse e-mail et un mot de
    passe. Claude l'inscrit ensuite comme administrateur de la plateforme ;
    la double authentification se règle à la première connexion à la
    console.

Le jeton Cloudflare du dépôt (ajouté le 29/09) expire fin octobre : le
renouveler avec le modèle « Edit Cloudflare Workers ».
