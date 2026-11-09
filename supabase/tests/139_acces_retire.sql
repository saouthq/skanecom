-- =====================================================================
-- 139 · L'accès retiré se dit : le nom de la boutique, à l'ancien membre seul
-- =====================================================================
begin;
\ir outils.psql

select plan(3);

reset role; select tests.connecte('lecture_a');
select is((select public.mes_acces_retires()), '[]'::jsonb, 'un membre actif : rien de retiré');
reset role;
update plateforme.membres set actif = false where user_id = tests.id('lecture_a') and boutique_id = tests.id('A');
select tests.connecte('lecture_a');
select is((select public.mes_acces_retires()), '["Essai A"]'::jsonb, 'son accès retiré : le nom de la boutique');
reset role; select tests.connecte('client_a');
select is((select public.mes_acces_retires()), '[]'::jsonb, 'un acheteur, jamais membre : rien');

select * from finish();
rollback;
