# Le déploiement en deux temps

Une version neuve de l'application démarre avec un cache de pages vide : le
cache du response store est rangé par version (`runtime-cache/<version>/` dans
le bucket `skanecom-application-response-store-cache-bodies`). Déployée d'un
coup, elle ferait attendre le premier visiteur de chaque page, boutique par
boutique. Le déploiement en deux temps prépare la version avant de lui donner
le trafic.

## Ce que fait `outils/deployer-deux-temps.sh`

1. **Dépôt sans trafic** : `vinext-cloudflare deploy --no-promote`
   (`wrangler versions upload`). La version qui sert ne change pas.
2. **À 0 %, à côté de celle qui sert** : `wrangler versions deploy
   <nouvelle>@0% <actuelle>@100%`. Un en-tête de version ne vise qu'une
   version présente dans le déploiement ; à 0 %, aucun visiteur ne la reçoit.
3. **Préchauffage, boutique par boutique** (`outils/prechauffer.mjs`) : pour
   chaque adresse de `CIBLES`, le plan du site (`/sitemap.xml`) est lu, puis
   chaque page est ouverte avec l'en-tête
   `Cloudflare-Workers-Version-Overrides: skanecom-application="<nouvelle>"`.
   Le rendu se fait par la nouvelle version, et le cache se remplit sous son
   préfixe. vinext ne sait préchauffer qu'une adresse (`--warm-cache-target`) ;
   une plateforme en sert plusieurs.
   - Un accueil qui ne répond pas 200 arrête tout : la version précédente
     reprend 100 % du trafic, rien n'est mis en service.
4. **En service** : `wrangler versions deploy <nouvelle>@100%`.
5. **Le cache des versions retirées s'efface** : une règle d'expiration R2 par
   préfixe (`runtime-cache/<version>/`, un jour). La version précédente garde
   le sien, pour pouvoir revenir en arrière d'une commande. La documentation du
   response store déconseille une expiration au seul âge, qui effacerait aussi
   des pages encore servies ; d'où une règle par version retirée. Une règle
   par déploiement ; R2 en accepte mille par bucket.

Variables : `CIBLES` (les adresses https des boutiques, séparées par des
espaces), `WORKER`, `BUCKET_CACHE`, `WRANGLER`. Le préchauffage lit aussi
`PAGES_MAX` (150 par boutique), `PARALLELE` (6) et `DELAI_MS` (15 000).

## Sur l'aperçu

`Aperçu en ligne` → *Run workflow* → cocher **deux_temps** : le déploiement
de l'aperçu passe par ce chemin et préchauffe les cinq boutiques de
démonstration (leurs routeurs transmettent l'en-tête de version à
l'application, par la liaison de service). Le bilan s'affiche dans le résumé
du workflow. Sans la case, l'aperçu se déploie comme avant, d'un coup.

## En production

Le même script, avec `CIBLES` = les domaines des boutiques ouvertes. Ce qui
manque pour le lancer est hors code :

- le projet Supabase de production (organisation SkanEcom) ;
- le compte Cloudflare de production et son jeton ;
- un premier `vinext-cloudflare deploy` ordinaire : `versions upload` exige
  que le Worker existe déjà.

Revenir en arrière : `wrangler versions deploy <précédente>@100% --name
skanecom-application --yes`. Son cache est encore là.
