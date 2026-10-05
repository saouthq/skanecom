-- ============================================================================
-- LES LISTES PAGINÉES — la lettre et les avis, page par page.
--
-- La liste des inscrits s'arrêtait en silence au deux-centième ; celle des
-- avis au cinquantième. Chacune reçoit un décalage (`p_decalage`) : l'écran
-- montre cinquante lignes, « 51–100 sur 312 », et les numéros de page. Le
-- nombre total était déjà rendu (`trouves` pour la lettre, `compteurs` pour
-- les avis).
--
-- L'ancienne signature disparaît : deux fonctions du même nom, l'une avec un
-- argument de plus et sa valeur par défaut, rendraient l'appel ambigu.
-- ============================================================================

drop function public.gestion_lettre(uuid, text);
drop function public.gestion_liste_avis(uuid, text, integer);

create function public.gestion_lettre(p_boutique_id uuid, p_recherche text default null, p_decalage integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := lower(nullif(btrim(coalesce(p_recherche, '')), ''));
  v_semaine date := date_trunc('week', (now() at time zone 'Africa/Tunis'))::date;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,lecture}');
  return jsonb_build_object(
    'actif', coalesce((private.reglage(p_boutique_id, 'vitrine.lettre'))::boolean, false),
    'compteurs', (select jsonb_build_object(
                    'inscrits', count(*) filter (where a.statut = 'inscrit'),
                    'a_confirmer', count(*) filter (where a.statut = 'a_confirmer' and a.demande_le > now() - interval '7 days'),
                    'nouveaux_30j', count(*) filter (where a.statut = 'inscrit' and a.inscrit_le > now() - interval '30 days'),
                    'desinscrits_30j', count(*) filter (where a.statut = 'desinscrit' and a.desinscrit_le > now() - interval '30 days'))
                  from public.lettre_abonnes a where a.boutique_id = p_boutique_id),
    -- Les inscriptions confirmées, semaine par semaine (lundi), et les départs.
    'semaines', (select jsonb_agg(jsonb_build_object(
                   'semaine', s.debut,
                   'inscrits', (select count(*) from public.lettre_abonnes a
                                 where a.boutique_id = p_boutique_id and a.inscrit_le is not null
                                   and (a.inscrit_le at time zone 'Africa/Tunis')::date between s.debut and s.debut + 6),
                   'desinscrits', (select count(*) from public.lettre_abonnes a
                                    where a.boutique_id = p_boutique_id and a.statut = 'desinscrit'
                                      and (a.desinscrit_le at time zone 'Africa/Tunis')::date between s.debut and s.debut + 6))
                   order by s.debut)
                 from (select (v_semaine - 7 * n) as debut from generate_series(0, 11) n) s),
    'trouves', (select count(*) from public.lettre_abonnes a
                 where a.boutique_id = p_boutique_id and a.statut = 'inscrit'
                   and (v_q is null or strpos(a.email, v_q) > 0)),
    'abonnes', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'email', x.email, 'inscrit_le', x.inscrit_le, 'page', x.page)
                       order by x.inscrit_le desc, x.email)
        from (select a.id, a.email, a.inscrit_le, a.page from public.lettre_abonnes a
               where a.boutique_id = p_boutique_id and a.statut = 'inscrit'
                 and (v_q is null or strpos(a.email, v_q) > 0)
               order by a.inscrit_le desc, a.email
               limit 50 offset greatest(coalesce(p_decalage, 0), 0)) x), '[]'::jsonb));
end;
$$;

create function public.gestion_liste_avis(p_boutique_id uuid, p_filtre text default 'a_moderer', p_limite integer default 50, p_decalage integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_statut text := case p_filtre when 'publies' then 'publie' when 'ecartes' then 'ecarte' else 'en_attente' end;
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', private.avis_actif(p_boutique_id),
    'moderation', coalesce(private.reglage(p_boutique_id, 'avis.moderation') #>> '{}', 'a_priori'),
    'compteurs', (select jsonb_build_object(
                    'a_moderer', count(*) filter (where a.statut = 'en_attente'),
                    'publies',   count(*) filter (where a.statut = 'publie'),
                    'ecartes',   count(*) filter (where a.statut = 'ecarte'),
                    'moyenne',   round(avg(a.note) filter (where a.statut = 'publie'), 1))
                    from public.avis a where a.boutique_id = p_boutique_id),
    'avis', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'note', x.note, 'texte', x.texte, 'auteur', x.auteur, 'statut', x.statut, 'motif', x.motif,
               'reponse', x.reponse, 'repondu_le', x.repondu_le, 'cree_le', x.created_at, 'modere_le', x.modere_le,
               'modere_par', (select u.email from auth.users u where u.id = x.modere_par),
               'produit', jsonb_build_object('id', p.id, 'nom', coalesce(p.nom_fr, p.nom_ar), 'slug', p.slug), 'variante_libelle', x.variante_libelle,
               'commande', c.numero,
               'client', jsonb_build_object('id', cl.id, 'nom', cl.nom, 'telephone', cl.telephone),
               'photos', private.photos_avis(x.boutique_id, x.id))
             order by case when v_statut = 'en_attente' then extract(epoch from x.created_at) else -extract(epoch from x.created_at) end, x.id)
        from (select a.* from public.avis a
               where a.boutique_id = p_boutique_id and a.statut = v_statut
               order by case when v_statut = 'en_attente' then a.created_at end asc,
                        case when v_statut <> 'en_attente' then a.created_at end desc, a.id
               limit least(greatest(coalesce(p_limite, 50), 1), 200) offset greatest(coalesce(p_decalage, 0), 0)) x
        join public.produits p on p.boutique_id = x.boutique_id and p.id = x.produit_id
        join public.commandes c on c.boutique_id = x.boutique_id and c.id = x.commande_id
        join public.clients cl on cl.boutique_id = x.boutique_id and cl.id = x.client_id), '[]'::jsonb));
end;
$$;

revoke execute on function public.gestion_lettre(uuid, text, integer) from public, anon;
grant  execute on function public.gestion_lettre(uuid, text, integer) to authenticated;
revoke execute on function public.gestion_liste_avis(uuid, text, integer, integer) from public, anon;
grant  execute on function public.gestion_liste_avis(uuid, text, integer, integer) to authenticated;
