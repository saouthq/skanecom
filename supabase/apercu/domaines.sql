-- =====================================================================
-- SkanEcom — APERÇU EN LIGNE SEULEMENT : les adresses workers.dev des
-- boutiques de démo deviennent leurs domaines principaux
-- =====================================================================
-- ⚠️ JAMAIS SUR LA PRODUCTION. Rejoué à chaque déploiement de l'aperçu
-- (.github/workflows/apercu.yml), après que le workflow a lu le sous-domaine
-- workers.dev du compte : __SOUS__ est remplacé avant l'envoi.
--
-- Le jeu de démo donne aux boutiques des domaines locaux (maymar.localhost…).
-- La console bâtit « Voir la vitrine », les e-mails et les liens de partage
-- sur le domaine principal : sans ce fichier, ils menaient à localhost. Les
-- domaines locaux restent, non principaux.
-- =====================================================================

with adresses (hote, slug) as (
  values
    ('skanecom-apercu-maymar.__SOUS__.workers.dev', 'maymar'),
    ('skanecom-apercu-selma.__SOUS__.workers.dev', 'maison-selma'),
    ('skanecom-apercu-quincaillerie.__SOUS__.workers.dev', 'quincaillerie-demo'),
    ('skanecom-apercu-beaute.__SOUS__.workers.dev', 'yasmine-beaute'),
    ('skanecom-apercu-maison.__SOUS__.workers.dev', 'dar-alia')
)
update plateforme.domaines d
   set principal = false
  from adresses a
  join plateforme.boutiques b on b.slug = a.slug
 where d.boutique_id = b.id and d.principal and d.hote <> a.hote;

with adresses (hote, slug) as (
  values
    ('skanecom-apercu-maymar.__SOUS__.workers.dev', 'maymar'),
    ('skanecom-apercu-selma.__SOUS__.workers.dev', 'maison-selma'),
    ('skanecom-apercu-quincaillerie.__SOUS__.workers.dev', 'quincaillerie-demo'),
    ('skanecom-apercu-beaute.__SOUS__.workers.dev', 'yasmine-beaute'),
    ('skanecom-apercu-maison.__SOUS__.workers.dev', 'dar-alia')
)
insert into plateforme.domaines (hote, boutique_id, type, principal, statut_certificat)
select a.hote, b.id, 'personnalise', true, 'actif'
  from adresses a
  join plateforme.boutiques b on b.slug = a.slug
on conflict (hote) do update set boutique_id = excluded.boutique_id, principal = true, statut_certificat = 'actif';
