-- =====================================================================
-- 61 · Les photos de l'accueil, depuis le backoffice
-- =====================================================================
begin;
\ir outils.psql

select plan(5);

create function tests.indice(p_sql text) returns text
language plpgsql as $$
declare
  v_indice text;
begin
  execute p_sql;
  raise exception 'passée' using hint = '__passee__';
exception when others then
  get stacked diagnostics v_indice = pg_exception_hint;
  return case when v_indice = '__passee__' then null else coalesce(nullif(v_indice, ''), 'sans indice') end;
end;
$$;
grant execute on all functions in schema tests to anon, authenticated;

select tests.connecte('proprio_a');
select is(public.gestion_enregistrer_accueil(tests.id('A'),
  '[{"type": "hero", "image": {"chemin": "essai-a/accueil/photo-aaaaaaaaaaaa.webp", "chemin_portrait": "essai-a/accueil/photo-bbbbbbbbbbbb.webp"}, "textes": {"image_alt_fr": "La boutique"}},
    {"type": "editorial", "image": {"chemin": "essai-a/accueil/photo-cccccccccccc.webp"}, "textes": {"titre_fr": "Notre histoire"}}]', 1),
  '{"version": 2, "orphelins": []}'::jsonb, 'des photos posées : rien d''orphelin');
select is(public.gestion_enregistrer_accueil(tests.id('A'),
  '[{"type": "hero", "image": {"chemin": "essai-a/accueil/photo-dddddddddddd.webp"}}, {"type": "editorial", "image": {"chemin": "essai-a/accueil/photo-cccccccccccc.webp"}, "textes": {"titre_fr": "Notre histoire"}}]', 2)
  -> 'orphelins',
  '["essai-a/accueil/photo-aaaaaaaaaaaa.webp", "essai-a/accueil/photo-bbbbbbbbbbbb.webp"]'::jsonb,
  'une photo d''ouverture changée : l''ancienne et son cadrage sont rendus, celle du récit, gardée, ne l''est pas');
select is(public.gestion_enregistrer_accueil(tests.id('A'), '[{"type": "engagements"}]', 3) -> 'orphelins',
  '["essai-a/accueil/photo-cccccccccccc.webp", "essai-a/accueil/photo-dddddddddddd.webp"]'::jsonb, 'les sections retirées : leurs photos aussi');
select is(tests.indice(format($$ select public.gestion_enregistrer_accueil(%L, '[{"type": "hero", "image": {"chemin": "essai-b/accueil/photo-eeeeeeeeeeee.webp"}}]', 4) $$, tests.id('A'))),
  'section', 'une photo hors du dossier de la boutique : refusée');
select is(tests.indice(format($$ select public.gestion_enregistrer_accueil(%L, '[{"type": "hero", "image": {"chemin": "essai-a/../essai-b/x.webp"}}]', 4) $$, tests.id('A'))),
  'section', 'un chemin qui remonte : refusé');

select * from finish();
rollback;
