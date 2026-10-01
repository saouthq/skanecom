-- =====================================================================
-- 60 · L'accueil de chaque métier, posé avec son préréglage
-- =====================================================================
begin;
\ir outils.psql

select plan(8);

-- Chaque accueil de métier passe la validation du thème (la même que
-- l'écran « Page d'accueil ») : posé tel quel sur une boutique d'essai.
create function tests.accueils_valides() returns integer
language plpgsql as $$
declare
  m record;
  n integer := 0;
begin
  for m in select code, definition -> 'sections' as sections from plateforme.metiers loop
    update public.themes set sections = m.sections where boutique_id = tests.id('A');
    n := n + 1;
  end loop;
  update public.themes set sections = null where boutique_id = tests.id('A');
  return n;
end;
$$;

reset role;
select is((select count(*)::integer from plateforme.metiers where jsonb_typeof(definition -> 'sections') = 'array'), 8,
  'chacun des huit métiers a son accueil');
select is(tests.accueils_valides(), 8, 'et chaque accueil passe la validation du thème');
select is((select count(*)::integer from plateforme.metiers m, jsonb_array_elements(m.definition -> 'sections') s where s ? 'textes'), 0,
  'aucun texte écrit d''avance : chaque section prend son titre par défaut');

select tests.service();
select public.console_creer_boutique(tests.id('admin_plateforme'), 'essai-tech', 'Essai Tech', 'essai-tech.test');
select is(public.console_appliquer_metier(tests.id('admin_plateforme'), (select id from plateforme.boutiques where slug = 'essai-tech'), 'high_tech') ->> 'accueil',
  'true', 'le préréglage dit qu''il a posé l''accueil');
reset role;
select is((select jsonb_path_query_array(t.sections, '$[*].type') from public.themes t join plateforme.boutiques b on b.id = t.boutique_id where b.slug = 'essai-tech'),
  '["hero", "rayons", "selection", "marques", "avis", "questions", "engagements"]'::jsonb, 'le high-tech : ses rayons, ses nouveautés, ses marques…');
select is(public.console_metiers(tests.id('admin_plateforme')) -> 0 -> 'sections', '7'::jsonb, 'la console dit combien de sections');

-- Une boutique vide qui a déjà composé son accueil le garde.
select tests.service();
select public.console_creer_boutique(tests.id('admin_plateforme'), 'essai-compose', 'Essai Composé', 'essai-compose.test');
reset role;
update public.themes t set sections = '[{"type": "hero", "textes": {"titre_fr": "Le nôtre"}}]'
  from plateforme.boutiques b where b.id = t.boutique_id and b.slug = 'essai-compose';
select tests.service();
select public.console_appliquer_metier(tests.id('admin_plateforme'), (select id from plateforme.boutiques where slug = 'essai-compose'), 'mode');
reset role;
select is((select t.sections from public.themes t join plateforme.boutiques b on b.id = t.boutique_id where b.slug = 'essai-compose'),
  '[{"type": "hero", "textes": {"titre_fr": "Le nôtre"}}]'::jsonb, 'un accueil déjà composé n''est pas remplacé');

-- L'écran « Page d'accueil » : chaque rayon avec ses pièces publiées (le
-- brouillon de A ne compte pas).
select tests.connecte('proprio_a');
select is(public.gestion_accueil(tests.id('A')) -> 'rayons' -> 0 -> 'produits', '1'::jsonb,
  'chaque rayon dit combien il a de pièces publiées : la vitrine ne montre que les rayons garnis');

select * from finish();
rollback;
