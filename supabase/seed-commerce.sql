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
