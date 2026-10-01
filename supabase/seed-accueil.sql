-- =====================================================================
-- SkanEcom · jeu de démonstration : LA BIBLIOTHÈQUE DE SECTIONS (migration 59)
-- =====================================================================
-- Maison Selma montre ce que disent ses clientes (ses avis publiés) entre
-- son récit et sa sélection homme, ses questions fréquentes avant ses
-- engagements, et ses « Nouveautés » le sont vraiment (les dernières
-- publiées d'abord). La quincaillerie montre ses marques et ses questions.
-- Maymar garde son accueil : rien ne change chez elle sans son équipe.
--
-- Les sections s'insèrent dans celles déjà posées (photos et textes
-- gardés). Un fichier à part : l'aperçu en ligne joue chaque jeu une fois
-- (supabase/functions/apercu-installer). Rejouable sans dommage.
-- =====================================================================

-- Maison Selma : ouverture, rayons, nouveautés, récit, AVIS, homme, QUESTIONS, engagements.
update public.themes t
   set sections = (
     select jsonb_agg(s.x order by s.o)
       from (select case when e.o = 3 and e.v ->> 'type' = 'selection' then e.v || '{"tri": "nouveautes"}'::jsonb else e.v end as x,
                    e.o * 10 as o
               from jsonb_array_elements(t.sections) with ordinality e(v, o)
             union all select '{"type": "avis", "nombre": 6}'::jsonb, 45
             union all select '{"type": "questions", "nombre": 4}'::jsonb, 55) s)
 where t.boutique_id = '00000000-0000-4000-8000-000000000003'
   and t.sections is not null
   and jsonb_array_length(t.sections) = 6
   and not t.sections @> '[{"type": "avis"}]';

-- La quincaillerie : … ses deux sélections, MARQUES, QUESTIONS, services.
update public.themes t
   set sections = (
     select jsonb_agg(s.x order by s.o)
       from (select e.v as x, e.o * 10 as o
               from jsonb_array_elements(t.sections) with ordinality e(v, o)
             union all select '{"type": "marques"}'::jsonb, 45
             union all select '{"type": "questions", "nombre": 4, "textes": {"titre_fr": "Avant de commander"}}'::jsonb, 47) s)
 where t.boutique_id = '00000000-0000-4000-8000-000000000002'
   and t.sections is not null
   and jsonb_array_length(t.sections) = 5
   and not t.sections @> '[{"type": "marques"}]';
