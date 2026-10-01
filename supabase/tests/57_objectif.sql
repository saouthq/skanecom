-- =====================================================================
-- 57 · L'objectif du mois : fixé par la direction, suivi au livré
-- =====================================================================
begin;
\ir outils.psql

select plan(13);

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
-- Une commande de la boutique A, à un statut donné, livrée (ou non) à une date donnée.
create function tests.commande(p_statut public.statut_commande, p_total bigint, p_livree timestamptz default null)
returns void language sql as $$
  insert into public.commandes (boutique_id, contact_nom, contact_telephone, livraison_ligne1, livraison_ville,
                                livraison_gouvernorat, statut, total_millimes, created_at, livree_at, refus_origine)
  values (tests.id('A'), 'Client A', '+21620000001', '1 rue de Rome', 'Tunis', 'tunis', p_statut, p_total,
          coalesce(p_livree, now()) - interval '2 days', p_livree,
          case when p_statut = 'refusee' then 'client'::public.origine_refus end)
$$;
grant execute on all functions in schema tests to anon, authenticated;

reset role;
-- Ce mois-ci : 300 + 200 TND livrés ; 150 TND en route ; une refusée et une
-- annulée ne comptent pas. Le mois dernier : 400 TND livrés.
select tests.commande('livree', 300000, now());
select tests.commande('livree', 200000, now());
select tests.commande('expediee', 150000);
select tests.commande('refusee', 90000);
select tests.commande('annulee', 70000);
select tests.commande('livree', 400000, (date_trunc('month', now() at time zone 'Africa/Tunis') - interval '10 days') at time zone 'Africa/Tunis');

-- ---------------------------------------------------------------------
-- Fixer
-- ---------------------------------------------------------------------
select tests.connecte('lecture_a');
select is(tests.indice(format($$ select public.gestion_fixer_objectif(%L, date_trunc('month', now() at time zone 'Africa/Tunis')::date, 1000000) $$, tests.id('A'))),
  'role', 'la lecture ne fixe pas l''objectif');
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_objectif(%L) $$, tests.id('A')), '42501', null, 'une autre boutique ne lit rien');
reset role; select tests.connecte('proprio_a');
select is(tests.indice(format($$ select public.gestion_fixer_objectif(%L, (date_trunc('month', now() at time zone 'Africa/Tunis') - interval '1 month')::date, 1000000) $$, tests.id('A'))),
  'mois', 'un mois passé est un fait, pas un objectif');
select is(tests.indice(format($$ select public.gestion_fixer_objectif(%L, date_trunc('month', now() at time zone 'Africa/Tunis')::date, 10) $$, tests.id('A'))),
  'montant', 'un objectif d''au moins 1 TND');
select is(public.gestion_objectif(tests.id('A')) -> 'objectif', 'null'::jsonb, 'sans objectif : rien de fixé');
select is((public.gestion_objectif(tests.id('A')) ->> 'mois_dernier')::bigint, 400000::bigint, 'le livré du mois dernier, pour proposer un chiffre');
select public.gestion_fixer_objectif(tests.id('A'), date_trunc('month', now() at time zone 'Africa/Tunis')::date, 1000000);

-- ---------------------------------------------------------------------
-- Suivre
-- ---------------------------------------------------------------------
select results_eq($$ select (x ->> 'objectif')::bigint, (x ->> 'livre')::bigint, (x ->> 'en_route')::bigint
                     from (select public.gestion_objectif(tests.id('A')) as x) t $$,
  $$ values (1000000::bigint, 500000::bigint, 150000::bigint) $$,
  'l''objectif, le livré du mois (ni refus ni annulation), ce qui est en route');
select is((public.gestion_objectif(tests.id('A')) ->> 'par_jour')::bigint,
  ceil(500000::numeric / ((date_trunc('month', now() at time zone 'Africa/Tunis') + interval '1 month' - interval '1 day')::date
                          - (now() at time zone 'Africa/Tunis')::date + 1))::bigint,
  'ce qu''il faut livrer par jour, aujourd''hui compris, pour l''atteindre');
select is(jsonb_array_length(public.gestion_objectif(tests.id('A')) -> 'historique'), 6, 'les six mois d''avant');
select is((public.gestion_objectif(tests.id('A')) #>> '{historique,5,livre}')::bigint, 400000::bigint, 'le mois dernier, au bout de l''historique');

select public.gestion_fixer_objectif(tests.id('A'), (date_trunc('month', now() at time zone 'Africa/Tunis') + interval '1 month')::date, 1200000);
select is((public.gestion_objectif(tests.id('A')) ->> 'objectif_suivant')::bigint, 1200000::bigint, 'le mois suivant se prépare d''avance');
select public.gestion_fixer_objectif(tests.id('A'), date_trunc('month', now() at time zone 'Africa/Tunis')::date, null);
select is(public.gestion_objectif(tests.id('A')) -> 'objectif', 'null'::jsonb, 'sans montant : l''objectif est retiré');
reset role;
select is((select count(*)::integer from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'objectif.fixer'), 3,
  'chaque changement est tracé');

select * from finish();
rollback;
