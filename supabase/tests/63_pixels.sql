-- =====================================================================
-- 63 · Les pixels publicitaires : deux réglages, leur forme vérifiée
-- =====================================================================
begin;
\ir outils.psql

select plan(11);

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
create function tests.pose(p_cle text, p_valeur text) returns text language sql as $$
  select tests.indice(format($f$ insert into public.reglages (boutique_id, cle, valeur) values (%L, %L, to_jsonb(%L::text))
                                on conflict (boutique_id, cle) do update set valeur = excluded.valeur $f$,
                             tests.id('A'), p_cle, p_valeur))
$$;

select results_eq($$ select cle, type_valeur, defaut, public from plateforme.reglages_catalogue where cle like 'pub.%' order by cle $$,
  $$ values ('pub.pixel_meta'::text, 'texte'::text, '""'::jsonb, true), ('pub.pixel_tiktok', 'texte', '""'::jsonb, true) $$,
  'deux réglages, vides par défaut, lus par la vitrine');

-- Meta : des chiffres.
select is(tests.pose('pub.pixel_meta', '1234567890123456'), null, 'Meta : seize chiffres, acceptés');
select is(tests.pose('pub.pixel_meta', ''), null, 'Meta : vide, accepté (plus de pixel)');
select is(tests.pose('pub.pixel_meta', '12345abc90123456'), 'pixel', 'Meta : des lettres, refusées');
select is(tests.pose('pub.pixel_meta', '123456789'), 'pixel', 'Meta : neuf chiffres, trop court');
select is(tests.pose('pub.pixel_meta', '1234567890123456"</script><script>alert(1)</script>'), 'pixel',
  'Meta : de quoi sortir du script de la page, refusé');

-- TikTok : des lettres majuscules et des chiffres.
select is(tests.pose('pub.pixel_tiktok', 'C4ABCDEFGHIJ12345678'), null, 'TikTok : vingt caractères, acceptés');
-- (tests.pose essaie dans une sous-transaction : rien ne reste ; celui-ci reste.)
select lives_ok($$ insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'pub.pixel_tiktok', '"C4ABCDEFGHIJ12345678"') $$,
  'TikTok : posé pour de bon');
select is(tests.pose('pub.pixel_tiktok', 'c4abcdefghij12345678'), 'pixel', 'TikTok : en minuscules, refusé (le backoffice met en majuscules)');
select is(tests.pose('pub.pixel_tiktok', 'C4ABCDEF GHIJ1234567'), 'pixel', 'TikTok : une espace, refusée');

select results_eq($$ select r.valeur #>> '{}' from public.reglages r where r.boutique_id = tests.id('A') and r.cle = 'pub.pixel_tiktok' $$,
  $$ values ('C4ABCDEFGHIJ12345678'::text) $$, 'un refus laisse le réglage d''avant');

select * from finish();
rollback;
