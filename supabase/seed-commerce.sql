-- =====================================================================
-- SkanEcom · jeu de démonstration : LA STRUCTURE COMMERCE (migration 70)
-- =====================================================================
-- La Quincaillerie du Sud passe en Commerce : la recherche d'abord (son
-- ouverture devient une grande barre de recherche, ses rayons en
-- raccourcis), ses services en bande juste dessous, puis ses rayons, ses
-- références, sa visserie, ses marques et ses questions — ses textes et
-- ses photos gardés. Le grand menu des rayons, la comparaison et la barre
-- d'onglets du téléphone viennent de la structure, sans réglage.
--
-- Le style que la structure conseille (coins arrondis, casse normale,
-- titres sobres, grille serrée), la boutique n'ayant pas réglé le sien.
--
-- Sous ses services, des bannières qui défilent (migration 75) : ses scies
-- (la photo du rayon, que l'accueil ne montre pas ailleurs), le retrait au
-- magasin et le conseil sur WhatsApp — sur un aplat, ce que la boutique
-- dit déjà d'elle-même.
--
-- Joué après seed-accueil.sql ; rejouable sans dommage.
-- =====================================================================

update public.themes t
   set code = 'commerce',
       style = '{"coins": "arrondis", "casse": "normale", "titres": "sobre", "densite": "serree"}'::jsonb || coalesce(t.style, '{}'::jsonb),
       sections = (
         select jsonb_agg(x.v order by x.o)
           from (select e.v, case when e.v ->> 'type' = 'engagements' then 15 else e.o * 10 end as o
                   from jsonb_array_elements(t.sections) with ordinality e(v, o)) x)
 where t.boutique_id = '00000000-0000-4000-8000-000000000002'
   and t.code <> 'commerce'
   and t.sections is not null;

-- Les bannières, juste après la bande des services (une fois).
update public.themes t
   set sections = (
         select jsonb_agg(x.v order by x.o)
           from (select e.v, e.o * 10 as o from jsonb_array_elements(t.sections) with ordinality e(v, o)
                 union all
                 select $b${"type": "bannieres", "diapos": [
                   {"image": {"chemin": "quincaillerie-demo/rayons/scies-1000.webp"},
                    "textes": {"titre_fr": "Les scies",
                               "texte_fr": "Scie circulaire 1 400 W, lames carbure de rechange : en stock au magasin de Sfax.",
                               "cta_fr": "Voir les scies",
                               "image_alt_fr": "Scie circulaire posée sur des tréteaux, des chutes de bois autour"},
                    "lien": "/categorie/scies"},
                   {"textes": {"titre_fr": "Retrait au magasin",
                               "texte_fr": "Gratuit, au magasin de Sfax : votre commande est prête sous 2 heures après confirmation.",
                               "cta_fr": "Voir le catalogue"},
                    "lien": "/catalogue"},
                   {"textes": {"titre_fr": "Un conseil avant d'acheter ?",
                               "texte_fr": "Le bon foret, la bonne vis : un vendeur du magasin vous répond sur WhatsApp.",
                               "cta_fr": "Nous écrire"},
                    "lien": "/contact"}
                 ]}$b$::jsonb,
                        (select e.o * 10 + 5 from jsonb_array_elements(t.sections) with ordinality e(v, o)
                          where e.v ->> 'type' = 'engagements' limit 1)) x)
 where t.boutique_id = '00000000-0000-4000-8000-000000000002'
   and t.code = 'commerce'
   and t.sections is not null
   and exists (select 1 from jsonb_array_elements(t.sections) e where e ->> 'type' = 'engagements')
   and not exists (select 1 from jsonb_array_elements(t.sections) e where e ->> 'type' = 'bannieres');
