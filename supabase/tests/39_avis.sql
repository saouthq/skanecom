-- =====================================================================
-- 39 · Les avis clients vérifiés : noter, publier, écarter, répondre
-- =====================================================================
begin;
\ir outils.psql

select plan(48);

-- Jeu d'essai (outils.psql) : client_a a une commande dans A (une ligne,
-- la valise cabine, contact « Client A ») ; client_ab en a une dans A.
create function tests.ligne(p_commande text) returns uuid language sql security definer set search_path = '' as $$
  select id from public.commande_lignes where commande_id = tests.id(p_commande)
$$;
create function tests.numero(p_commande text) returns text language sql security definer set search_path = '' as $$
  select numero from public.commandes where id = tests.id(p_commande)
$$;
create function tests.avis(p_commande text, p_note integer default 5, p_texte text default 'Solide, roule bien, livrée vite.')
returns jsonb language sql as $$
  select public.donner_avis(tests.id('A'), tests.numero(p_commande), tests.ligne(p_commande), p_note, p_texte)
$$;
create function tests.id_avis(p_commande text) returns uuid language sql security definer set search_path = '' as $$
  select id from public.avis where ligne_id = tests.ligne(p_commande)
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
grant execute on all functions in schema tests to anon, authenticated;

-- ---------------------------------------------------------------------
-- Le module, le réglage
-- ---------------------------------------------------------------------
reset role;
select results_eq($$ select disponible from plateforme.modules where code = 'avis' $$, $$ values (true) $$,
  'le module avis est disponible à la console');
select results_eq($$ select type_valeur, defaut, public, module from plateforme.reglages_catalogue where cle = 'avis.moderation' $$,
  $$ values ('choix'::text, '"a_priori"'::jsonb, false, 'avis'::text) $$,
  'le réglage de publication : à priori par défaut, du module, lu par l''équipe seulement');
select is(private.nom_public('Amel Ben Salah'), 'Amel B.', 'le nom montré : le prénom et l''initiale du nom');
select is(private.nom_public('  Hédi  '), 'Hédi', 'un seul mot reste tel quel');
select is(private.nom_public(''), 'Client', 'sans nom : « Client »');

-- ---------------------------------------------------------------------
-- Donner son avis
-- ---------------------------------------------------------------------
reset role; select tests.connecte('client_a');
select is(tests.indice($$ select tests.avis('commande_a') $$), 'module', 'module coupé : pas d''avis');

reset role;
insert into plateforme.modules_actifs (boutique_id, module) values (tests.id('A'), 'avis');
select tests.anonyme();
select throws_ok($$ select tests.avis('commande_a') $$, '42501', null, 'un visiteur ne note rien : la fonction lui est fermée');
reset role; select tests.connecte('client_a');
select is(tests.indice($$ select tests.avis('commande_a') $$), 'statut', 'une commande pas encore livrée : non');

reset role;
update public.commandes set statut = 'livree', livree_at = now() - interval '3 days' where id in (tests.id('commande_a'), tests.id('commande_ab_a'));
select tests.connecte('client_a');
select is(tests.indice($$ select tests.avis('commande_ab_a') $$), 'commande', 'la commande d''un autre client : introuvable');
select is(tests.indice(format($$ select public.donner_avis(%L, %L, %L, 5, null) $$, tests.id('A'), tests.numero('commande_a'), tests.ligne('commande_ab_a'))),
  'ligne', 'un article d''une autre commande : non');
select is(tests.indice($$ select tests.avis('commande_a', 0) $$), 'note', 'une note de 0 : non');
select is(tests.indice($$ select tests.avis('commande_a', 6) $$), 'note', 'ni de 6');
select is(tests.indice(format($$ select tests.avis('commande_a', 4, %L) $$, repeat('x', 1001))), 'texte', 'un texte de plus de 1 000 caractères : non');
select is(tests.avis('commande_a', 4) ->> 'statut', 'en_attente', 'l''avis part, en attente de relecture (réglage par défaut)');
select is(tests.indice($$ select tests.avis('commande_a') $$), 'deja', 'un seul avis par article commandé');
select results_eq($$ select x ->> 'note', x ->> 'statut', x ->> 'commande' from jsonb_array_elements(public.mes_avis(tests.id('A'))) x $$,
  $$ values ('4', 'en_attente', tests.numero('commande_a')) $$, 'le client relit son avis');
select is(public.mes_avis(tests.id('B')), '[]'::jsonb, 'dans une autre boutique, rien');
reset role; select tests.connecte('client_ab');
select is(public.mes_avis(tests.id('A')), '[]'::jsonb, 'un autre client ne voit pas cet avis');
reset role; select tests.connecte('client_a');
select is((select count(*)::int from public.avis), 0, 'le client ne lit pas la table (RLS)');
select throws_ok(format($$ insert into public.avis (boutique_id, produit_id, commande_id, ligne_id, client_id, note, auteur)
                          values (%L, %L, %L, %L, %L, 5, 'Pirate') $$,
                        tests.id('A'), tests.id('produit_a'), tests.id('commande_a'), tests.ligne('commande_ab_a'), tests.id('fiche_client_a')),
  '42501', null, '… ni n''y écrit');

-- ---------------------------------------------------------------------
-- La vitrine : seulement les avis publiés
-- ---------------------------------------------------------------------
reset role; select tests.anonyme();
select is(public.avis_produit(tests.id('A'), tests.id('produit_a')) ->> 'total', '0', 'en attente : la vitrine ne montre rien encore');
select is(public.avis_produit(tests.id('A'), tests.id('produit_a')) -> 'avis', '[]'::jsonb, '… ni dans la liste des avis');

-- ---------------------------------------------------------------------
-- L'équipe
-- ---------------------------------------------------------------------
reset role; select tests.connecte('proprio_b');
select throws_ok(format($$ select public.gestion_liste_avis(%L) $$, tests.id('A')), '42501', null, 'l''équipe d''une autre boutique ne lit rien');
reset role; select tests.connecte('lecture_a');
select is((public.gestion_avis_etat(tests.id('A')) ->> 'a_moderer')::int, 1, 'la navigation compte l''avis à relire');
select results_eq($$ select x ->> 'auteur', x ->> 'note', x #>> '{produit,slug}', x ->> 'commande', x #>> '{client,nom}'
                     from jsonb_array_elements(public.gestion_liste_avis(tests.id('A')) -> 'avis') x $$,
  $$ values ('Client A.', '4', 'valise-cabine', tests.numero('commande_a'), 'Client A') $$,
  'la liste : l''auteur montré, la note, le produit, la commande, le client');
select is(tests.indice(format($$ select public.gestion_moderer_avis(%L, %L, 'publier') $$, tests.id('A'), tests.id_avis('commande_a'))),
  'role', 'la lecture seule ne publie pas');
reset role; select tests.connecte('confirm_a');
select is(tests.indice(format($$ select public.gestion_moderer_avis(%L, %L, 'publier') $$, tests.id('A'), tests.id_avis('commande_a'))),
  'role', 'la confirmation non plus');

reset role; select tests.connecte('proprio_a');
select is(tests.indice(format($$ select public.gestion_moderer_avis(%L, %L, 'repondre', %L) $$, tests.id('A'), tests.id_avis('commande_a'), repeat('x', 1001))),
  'reponse', 'une réponse de plus de 1 000 caractères : non');
select is(public.gestion_moderer_avis(tests.id('A'), tests.id_avis('commande_a'), 'repondre', 'Merci Client, bon voyage !') ->> 'reponse',
  'Merci Client, bon voyage !', 'le propriétaire répond');
select is(public.gestion_moderer_avis(tests.id('A'), tests.id_avis('commande_a'), 'publier') ->> 'statut', 'publie', 'puis publie');
select is(tests.indice(format($$ select public.gestion_moderer_avis(%L, %L, 'publier') $$, tests.id('A'), tests.id_avis('commande_a'))),
  'etat', 'publier deux fois : non');
select is(tests.indice(format($$ select public.gestion_moderer_avis(%L, %L, 'ecarter', '  ') $$, tests.id('A'), tests.id_avis('commande_a'))),
  'motif', 'écarter sans motif : non');
select is(tests.indice(format($$ select public.gestion_moderer_avis(%L, %L, 'effacer') $$, tests.id('A'), tests.id_avis('commande_a'))),
  'geste', 'un geste inconnu : non');
select is(tests.indice(format($$ select public.gestion_moderer_avis(%L, %L, 'publier') $$, tests.id('A'), gen_random_uuid())),
  'avis', 'un avis inconnu : non');

reset role; select tests.anonyme();
select results_eq($$ select x ->> 'total', x ->> 'moyenne', x #>> '{repartition,4}', x #>> '{avis,0,auteur}', x #>> '{avis,0,reponse}', x #>> '{avis,0,variante_libelle}'
                     from (select public.avis_produit(tests.id('A'), tests.id('produit_a')) x) q $$,
  $$ values ('1', '4.0', '1', 'Client A.', 'Merci Client, bon voyage !', null::text) $$,
  'publié : la vitrine le montre, avec la moyenne, la répartition et la réponse');
select is(public.avis_produit(tests.id('B'), tests.id('produit_a')), null, 'une boutique sans le module : rien (null)');
select ok(not (public.avis_produit(tests.id('A'), tests.id('produit_a')) -> 'avis' -> 0 ? 'motif')
          and not (public.avis_produit(tests.id('A'), tests.id('produit_a')) -> 'avis' -> 0 ? 'client'),
  'jamais le client ni le motif sur la vitrine');

reset role;
select is((select apres ->> 'statut' from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'avis.publier'),
  'publie', 'la publication passe au journal');
select is((select acteur from plateforme.journal_audit where boutique_id = tests.id('A') and action = 'avis.repondre'),
  tests.id('proprio_a'), 'la réponse aussi, avec son auteur');

-- Écarter : la vitrine l'oublie, le motif reste à l'équipe, le client lit « écarté » sans motif.
select tests.connecte('proprio_a');
select is(public.gestion_moderer_avis(tests.id('A'), tests.id_avis('commande_a'), 'ecarter', 'Parle du livreur, pas du produit') ->> 'statut',
  'ecarte', 'le propriétaire l''écarte, avec un motif');
select is(tests.indice(format($$ select public.gestion_moderer_avis(%L, %L, 'repondre', 'Merci') $$, tests.id('A'), tests.id_avis('commande_a'))),
  'etat', 'on ne répond pas à un avis écarté');
select is(public.gestion_liste_avis(tests.id('A'), 'ecartes') #>> '{avis,0,motif}', 'Parle du livreur, pas du produit', 'l''équipe lit le motif');
reset role; select tests.anonyme();
select is(public.avis_produit(tests.id('A'), tests.id('produit_a')) ->> 'total', '0', 'écarté : la vitrine ne le montre plus');
reset role; select tests.connecte('client_a');
select ok((select x ->> 'statut' = 'ecarte' and not (x ? 'motif') from jsonb_array_elements(public.mes_avis(tests.id('A'))) x),
  'le client le lit écarté, sans le motif');

-- Publication automatique (réglage) : l'avis paraît aussitôt.
reset role;
insert into public.reglages (boutique_id, cle, valeur) values (tests.id('A'), 'avis.moderation', '"automatique"');
select tests.connecte('client_ab');
select is(tests.avis('commande_ab_a', 5, null) ->> 'statut', 'publie', 'publication automatique : l''avis paraît aussitôt, même sans texte');
reset role; select tests.anonyme();
select results_eq($$ select x ->> 'total', x ->> 'moyenne', x #>> '{avis,0,auteur}', x #>> '{avis,0,texte}'
                     from (select public.avis_produit(tests.id('A'), tests.id('produit_a')) x) q $$,
  $$ values ('1', '5.0', 'Client A.', null::text) $$, 'la vitrine le montre : la note seule, l''auteur « Client A. » (Client AB)');

-- Module coupé : plus rien sur la vitrine, rien d'effacé.
reset role;
update plateforme.modules_actifs set actif = false where boutique_id = tests.id('A') and module = 'avis';
select tests.anonyme();
select is(public.avis_produit(tests.id('A'), tests.id('produit_a')), null, 'module coupé : la fiche ne montre plus d''avis');
reset role;
select is((select count(*)::int from public.avis where boutique_id = tests.id('A')), 2, 'et rien n''est effacé');

select * from finish();
rollback;
