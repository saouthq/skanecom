-- =====================================================================
-- 01 · Structure : les règles d'isolation valent pour TOUTES les tables
-- =====================================================================
-- Ces tests lisent le catalogue de Postgres. Une table ajoutée demain qui
-- oublierait boutique_id, la RLS ou une clé composite fait échouer la CI.
begin;
\ir outils.psql

select plan(13);

-- Tables de boutique : celles de public qui portent boutique_id.
create temp view tables_boutique as
  select c.oid, c.relname
  from pg_class c
  join pg_namespace s on s.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'boutique_id' and not a.attisdropped
  where s.nspname = 'public' and c.relkind in ('r', 'p');

select ok((select count(*) from tables_boutique) >= 15,
  'au moins 15 tables de boutique sont reconnues (garde-fou du test lui-même)');

select is_empty($$
  select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname in ('public', 'plateforme') and c.relkind in ('r', 'p') and not c.relrowsecurity
$$, 'RLS activée sur toutes les tables de public et de plateforme');

select is_empty($$
  select t.relname from tables_boutique t
  join pg_attribute a on a.attrelid = t.oid and a.attname = 'boutique_id'
  where not a.attnotnull
$$, 'boutique_id est NOT NULL partout');

select is_empty($$
  select t.relname from tables_boutique t
  where not exists (
    select 1 from pg_constraint k
    where k.conrelid = t.oid and k.contype = 'f'
      and k.confrelid = 'plateforme.boutiques'::regclass
      and k.conkey = array[(select attnum from pg_attribute where attrelid = t.oid and attname = 'boutique_id')]
  )
$$, 'boutique_id référence plateforme.boutiques partout');

select is_empty($$
  select t.relname from tables_boutique t
  where exists (select 1 from pg_attribute a where a.attrelid = t.oid and a.attname = 'id' and not a.attisdropped)
    and not exists (
      select 1 from pg_constraint k
      where k.conrelid = t.oid and k.contype in ('u', 'p')
        and (select array_agg(a.attname::text order by a.attname)
             from unnest(k.conkey) n join pg_attribute a on a.attrelid = t.oid and a.attnum = n)
            = array['boutique_id', 'id']
    )
$$, 'chaque table de boutique avec un id a une unicité (boutique_id, id), cible des clés composites');

select is_empty($$
  select t.relname || ' → ' || k.conname
  from tables_boutique t
  join pg_constraint k on k.conrelid = t.oid and k.contype = 'f'
  where k.confrelid in (select oid from tables_boutique)
    and not (
      k.conkey[1]  = (select attnum from pg_attribute where attrelid = k.conrelid  and attname = 'boutique_id')
      and k.confkey[1] = (select attnum from pg_attribute where attrelid = k.confrelid and attname = 'boutique_id')
    )
$$, 'toute clé étrangère entre tables de boutique commence par boutique_id des deux côtés');

select is_empty($$
  select t.relname from tables_boutique t
  where not exists (
    select 1 from pg_trigger g
    where g.tgrelid = t.oid and not g.tgisinternal
      and g.tgfoid = 'private.boutique_immuable'::regproc
  )
$$, 'chaque table de boutique interdit de changer boutique_id (trigger boutique_immuable)');

select is_empty($$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname in ('public', 'private') and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
$$, 'toute fonction SECURITY DEFINER fige son search_path');

select is_empty($$
  select p.oid::regprocedure::text from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname in ('public', 'private') and p.prorettype = 'trigger'::regtype
    and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))
$$, 'aucune fonction de trigger n''est appelable par anon ou authenticated');

select is_empty($$
  select p.proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute')
    and p.proname not in ('mes_boutiques', 'est_membre', 'boutiques_visibles', 'mes_clients')
$$, 'anon n''exécute, dans private, que les fonctions dont les policies ont besoin');

select ok(not has_function_privilege('authenticated', 'private.reglage(uuid, text)', 'execute'),
  'private.reglage (lit les réglages internes) n''est accordée à aucun rôle de l''API');

select is_empty($$
  select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'plateforme' and c.relkind in ('r', 'p', 'v')
    and (has_table_privilege('anon', c.oid, 'select, insert, update, delete')
         or has_table_privilege('authenticated', c.oid, 'select, insert, update, delete'))
$$, 'anon et authenticated n''ont aucun droit sur les tables de plateforme');

select ok(not has_schema_privilege('anon', 'plateforme', 'usage')
          and not has_schema_privilege('authenticated', 'plateforme', 'usage'),
  'anon et authenticated n''ont pas accès au schéma plateforme');

select * from finish();
rollback;
