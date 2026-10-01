-- =====================================================================
-- 52 · Les photos des avis : jointes par l'auteur, publiées avec l'avis
-- =====================================================================
begin;
\ir outils.psql

select plan(23);

create function tests.ligne(p_commande text) returns uuid language sql security definer set search_path = '' as $$
  select id from public.commande_lignes where commande_id = tests.id(p_commande)
$$;
create function tests.numero(p_commande text) returns text language sql security definer set search_path = '' as $$
  select numero from public.commandes where id = tests.id(p_commande)
$$;
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
-- Le chemin qu'attend la base pour la photo n de l'avis a.
create function tests.chemin(p_avis uuid, p_nom text default 'a1b2c3d4e5f6') returns text language sql as $$
  select 'essai-a/avis/' || p_avis::text || '/' || p_nom || '.webp'
$$;
grant execute on all functions in schema tests to anon, authenticated;

reset role;
select results_eq($$ select type_valeur, defaut, public, module from plateforme.reglages_catalogue where cle = 'avis.photos' $$,
  $$ values ('booleen'::text, 'false'::jsonb, true, 'avis'::text) $$,
  'le réglage : coupé par défaut, du module avis, lu par la vitrine');

insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'avis');
update public.commandes set statut = 'livree', livree_at = now() - interval '3 days' where id in (tests.id('commande_a'), tests.id('commande_ab_a'));

-- ---------------------------------------------------------------------
-- Donner son avis rend son identifiant ; les photos, réglage coupé : non
-- ---------------------------------------------------------------------
select tests.connecte('client_a');
create temporary table avis_a on commit drop as
  select public.donner_avis(tests.id('A'), tests.numero('commande_a'), tests.ligne('commande_a'), 5, 'Elle roule bien.') as r;
grant select on avis_a to authenticated, anon;
select ok((select (r ->> 'id')::uuid is not null and r ->> 'photos' = 'false' from avis_a), 'donner_avis rend l''avis et dit que les photos sont coupées');
create function pg_temp.a() returns uuid language sql as $$ select (r ->> 'id')::uuid from avis_a $$;
grant execute on all functions in schema pg_temp to anon, authenticated;
select is(tests.indice(format($$ select public.ajouter_photo_avis(%L, %L, %L) $$, tests.id('A'), pg_temp.a(), tests.chemin(pg_temp.a()))),
  'module', 'réglage coupé : pas de photo');

reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'avis.photos', 'true');

-- ---------------------------------------------------------------------
-- Joindre ses photos
-- ---------------------------------------------------------------------
select tests.anonyme();
select throws_ok(format($$ select public.ajouter_photo_avis(%L, %L, %L) $$, tests.id('A'), pg_temp.a(), tests.chemin(pg_temp.a())),
  '42501', null, 'un visiteur ne joint rien : la fonction lui est fermée');
reset role; select tests.connecte('client_ab');
select is(tests.indice(format($$ select public.ajouter_photo_avis(%L, %L, %L) $$, tests.id('A'), pg_temp.a(), tests.chemin(pg_temp.a()))),
  'avis', 'l''avis d''un autre client : introuvable');
reset role; select tests.connecte('client_a');
select is(tests.indice(format($$ select public.ajouter_photo_avis(%L, %L, %L) $$, tests.id('A'), pg_temp.a(), 'essai-a/produits/x/a1b2c3d4e5f6.webp')),
  'chemin', 'un chemin hors du dossier de l''avis : non');
select is(tests.indice(format($$ select public.ajouter_photo_avis(%L, %L, %L) $$, tests.id('A'), pg_temp.a(), 'essai-b/avis/' || pg_temp.a() || '/a1b2c3d4e5f6.webp')),
  'chemin', 'ni dans le dossier d''une autre boutique');
select is(tests.indice(format($$ select public.ajouter_photo_avis(%L, %L, %L) $$, tests.id('A'), pg_temp.a(), tests.chemin(pg_temp.a(), '../../x'))),
  'chemin', 'ni un chemin qui remonte');
select is(public.ajouter_photo_avis(tests.id('A'), pg_temp.a(), tests.chemin(pg_temp.a(), 'aaaaaaaa1111'), 1200, 1500) ->> 'position', '0', 'la première photo : place 0');
select is(public.ajouter_photo_avis(tests.id('A'), pg_temp.a(), tests.chemin(pg_temp.a(), 'bbbbbbbb2222')) ->> 'position', '1', 'la deuxième : place 1');
select is(public.ajouter_photo_avis(tests.id('A'), pg_temp.a(), tests.chemin(pg_temp.a(), 'cccccccc3333')) ->> 'position', '2', 'la troisième : place 2');
select is(tests.indice(format($$ select public.ajouter_photo_avis(%L, %L, %L) $$, tests.id('A'), pg_temp.a(), tests.chemin(pg_temp.a(), 'dddddddd4444'))),
  'nombre', 'une quatrième : non, trois au plus');
select results_eq($$ select jsonb_array_length(x -> 'photos') from jsonb_array_elements(public.mes_avis(tests.id('A'))) x $$,
  $$ values (3) $$, 'le client relit son avis et ses trois photos');

-- ---------------------------------------------------------------------
-- La vitrine : rien tant que l'avis attend ; publié, ses photos
-- ---------------------------------------------------------------------
select tests.anonyme();
select is(public.avis_produit(tests.id('A'), tests.id('produit_a')) -> 'photos', '[]'::jsonb, 'l''avis attend sa relecture : la vitrine ne montre aucune photo');
reset role; select tests.connecte('proprio_a');
select is(jsonb_array_length(public.gestion_liste_avis(tests.id('A')) -> 'avis' -> 0 -> 'photos'), 3, 'l''équipe voit les photos avec l''avis à relire');
select is(public.gestion_moderer_avis(tests.id('A'), pg_temp.a(), 'publier') ->> 'statut', 'publie', 'elle le publie');
select tests.anonyme();
select results_eq($$ select x ->> 'chemin' from jsonb_array_elements(public.avis_produit(tests.id('A'), tests.id('produit_a')) -> 'avis' -> 0 -> 'photos') x $$,
  $$ values (tests.chemin(pg_temp.a(), 'aaaaaaaa1111')), (tests.chemin(pg_temp.a(), 'bbbbbbbb2222')), (tests.chemin(pg_temp.a(), 'cccccccc3333')) $$,
  'publié : ses trois photos, dans leur ordre');
select is(jsonb_array_length(public.avis_produit(tests.id('A'), tests.id('produit_a')) -> 'photos'), 3, 'et « Les photos des clients » en rang');
reset role;
update public.reglages set valeur = 'false' where boutique_id = tests.id('A') and cle = 'avis.photos';
select tests.anonyme();
select is(public.avis_produit(tests.id('A'), tests.id('produit_a')) -> 'avis' -> 0 -> 'photos', '[]'::jsonb, 'réglage coupé : l''avis reste, ses photos ne paraissent plus');
reset role;
update public.reglages set valeur = 'true' where boutique_id = tests.id('A') and cle = 'avis.photos';

-- ---------------------------------------------------------------------
-- L'équipe retire une photo ; plus tard, l'auteur n'en ajoute plus
-- ---------------------------------------------------------------------
reset role; select tests.connecte('confirm_a');
select is(tests.indice(format($$ select public.gestion_retirer_photo_avis(%L, (select id from public.avis_photos where position = 0 limit 1)) $$, tests.id('A'))),
  'role', 'un confirmateur ne retire pas de photo');
reset role; select tests.connecte('proprio_a');
select is(public.gestion_retirer_photo_avis(tests.id('A'), (select id from public.avis_photos where boutique_id = tests.id('A') and position = 0)) ->> 'chemin',
  tests.chemin(pg_temp.a(), 'aaaaaaaa1111'), 'la propriétaire retire la première : son chemin revient, pour le fichier');
select results_eq($$ select chemin, position::integer from public.avis_photos where boutique_id = tests.id('A') order by position $$,
  $$ values (tests.chemin(pg_temp.a(), 'bbbbbbbb2222'), 0), (tests.chemin(pg_temp.a(), 'cccccccc3333'), 1) $$,
  'les suivantes remontent d''une place');
reset role;
update public.avis set created_at = now() - interval '2 hours' where id = pg_temp.a();
select tests.connecte('client_a');
select is(tests.indice(format($$ select public.ajouter_photo_avis(%L, %L, %L) $$, tests.id('A'), pg_temp.a(), tests.chemin(pg_temp.a(), 'eeeeeeee5555'))),
  'delai', 'deux heures après l''avis : une photo ne s''ajoute plus');

select * from finish();
rollback;
