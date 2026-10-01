-- =====================================================================
-- 74 · Chaque métier, sa structure
-- =====================================================================
begin;
\ir outils.psql

select plan(3);

select results_eq(
  $$ select code, definition ->> 'theme' from plateforme.metiers order by position $$,
  $$ values ('mode', 'immersif'), ('beaute', 'editorial'), ('bijoux', 'immersif'), ('high_tech', 'commerce'),
            ('maison', 'bento'), ('alimentation', 'bento'), ('outillage', 'commerce'), ('bagages', 'editorial') $$,
  'chaque métier pose la structure qui lui va');

-- Une boutique vide reçoit le préréglage de la quincaillerie : la structure Commerce.
select tests.service();
select public.console_creer_boutique(tests.id('admin_plateforme'), 'essai-metier', 'Essai métier', 'essai-metier.test');
select is(public.console_appliquer_metier(tests.id('admin_plateforme'), (select id from plateforme.boutiques where slug = 'essai-metier'), 'outillage') ->> 'gabarit',
  'commerce', 'le préréglage dit la structure posée');
reset role;
select is((select t.code from public.themes t join plateforme.boutiques b on b.id = t.boutique_id where b.slug = 'essai-metier'), 'commerce',
  'la boutique est en Commerce');

select * from finish();
rollback;
