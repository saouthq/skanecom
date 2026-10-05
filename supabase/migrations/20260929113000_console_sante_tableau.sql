-- =====================================================================
-- LA SANTÉ DES BOUTIQUES ET LE TABLEAU DE BORD DE LA PLATEFORME
--
-- console_sante : ce que « À surveiller » doit voir en plus — le taux de
-- refus à la livraison (le chiffre qui tue une boutique au paiement à la
-- livraison), une boutique qui ne reçoit plus rien, un SAV, un devis ou un
-- avis qui attend, un certificat de domaine en erreur, des produits
-- épuisés en vitrine.
--
-- console_tableau : sur une période (7, 30, 90 jours) et la précédente,
-- par boutique : commandes reçues, livrées, refusées, chiffre (le total des
-- commandes livrées dans la période), panier moyen ; et pour la plateforme,
-- la série jour par jour. Les jours sont ceux de Tunis.
-- =====================================================================

create function public.console_sante(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', b.id,
      'livrees_30j', (select count(*) from public.commandes c where c.boutique_id = b.id and c.statut = 'livree'
                        and coalesce(c.livree_at, c.cloturee_at, c.updated_at) >= now() - interval '30 days'),
      'refusees_30j', (select count(*) from public.commandes c where c.boutique_id = b.id and c.statut = 'refusee'
                        and coalesce(c.cloturee_at, c.updated_at) >= now() - interval '30 days'),
      'derniere_commande', (select max(c.created_at) from public.commandes c where c.boutique_id = b.id),
      'sav', (select jsonb_build_object('n', count(*), 'depuis', min(s.created_at)) from public.sav_demandes s
               where s.boutique_id = b.id and s.statut = 'nouvelle'),
      'devis', (select jsonb_build_object('n', count(*), 'depuis', min(d.created_at)) from public.devis d
                 where d.boutique_id = b.id and d.statut = 'demande'),
      'avis', (select jsonb_build_object('n', count(*), 'depuis', min(a.created_at)) from public.avis a
                where a.boutique_id = b.id and a.statut = 'en_attente'),
      'certificats_erreur', coalesce((select jsonb_agg(d.hote order by d.hote) from plateforme.domaines d
                                       where d.boutique_id = b.id and d.statut_certificat = 'erreur'), '[]'::jsonb),
      'epuises', (select count(*) from public.produits p
                   where p.boutique_id = b.id and p.publie
                     and exists (select 1 from public.variantes v where v.produit_id = p.id and v.actif)
                     and not exists (select 1 from public.variantes v where v.produit_id = p.id and v.actif and v.stock > 0)),
      'publies', (select count(*) from public.produits p where p.boutique_id = b.id and p.publie),
      'formule', b.formule
    ) order by b.nom)
    from plateforme.boutiques b), '[]'::jsonb);
end;
$$;

create function public.console_tableau(p_acteur uuid, p_jours integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jours   integer := case when p_jours in (7, 30, 90) then p_jours else 30 end;
  v_fin     date := (now() at time zone 'Africa/Tunis')::date;
  v_debut   date := v_fin - (v_jours - 1);
  v_d       timestamptz;
  v_f       timestamptz;
  v_pd      timestamptz;
begin
  perform private.console_exige_admin(p_acteur);
  v_d  := v_debut::timestamp at time zone 'Africa/Tunis';
  v_f  := (v_fin + 1)::timestamp at time zone 'Africa/Tunis';
  v_pd := (v_debut - v_jours)::timestamp at time zone 'Africa/Tunis';

  return jsonb_build_object(
    'jours', v_jours, 'du', v_debut, 'au', v_fin,
    'boutiques', coalesce((
      select jsonb_agg(x order by (x ->> 'chiffre')::bigint desc, x ->> 'nom') from (
        select jsonb_build_object(
          'id', b.id, 'slug', b.slug, 'nom', b.nom, 'statut', b.statut, 'demonstration', b.demonstration, 'formule', b.formule,
          'recues', (select count(*) from public.commandes c where c.boutique_id = b.id and c.statut <> 'annulee'
                       and c.created_at >= v_d and c.created_at < v_f),
          'livrees', (select count(*) from public.commandes c where c.boutique_id = b.id and c.statut = 'livree'
                        and coalesce(c.livree_at, c.cloturee_at) >= v_d and coalesce(c.livree_at, c.cloturee_at) < v_f),
          'refusees', (select count(*) from public.commandes c where c.boutique_id = b.id and c.statut = 'refusee'
                         and coalesce(c.cloturee_at, c.updated_at) >= v_d and coalesce(c.cloturee_at, c.updated_at) < v_f),
          'chiffre', (select coalesce(sum(c.total_millimes), 0) from public.commandes c where c.boutique_id = b.id and c.statut = 'livree'
                        and coalesce(c.livree_at, c.cloturee_at) >= v_d and coalesce(c.livree_at, c.cloturee_at) < v_f),
          'precedent', jsonb_build_object(
            'recues', (select count(*) from public.commandes c where c.boutique_id = b.id and c.statut <> 'annulee'
                         and c.created_at >= v_pd and c.created_at < v_d),
            'chiffre', (select coalesce(sum(c.total_millimes), 0) from public.commandes c where c.boutique_id = b.id and c.statut = 'livree'
                          and coalesce(c.livree_at, c.cloturee_at) >= v_pd and coalesce(c.livree_at, c.cloturee_at) < v_d))
        ) as x
        from plateforme.boutiques b) t), '[]'::jsonb),
    -- La plateforme jour par jour, sans les boutiques de démonstration.
    'serie', coalesce((
      select jsonb_agg(jsonb_build_object('jour', j.jour,
               'recues', (select count(*) from public.commandes c join plateforme.boutiques b on b.id = c.boutique_id
                           where not b.demonstration and c.statut <> 'annulee'
                             and (c.created_at at time zone 'Africa/Tunis')::date = j.jour),
               'chiffre', (select coalesce(sum(c.total_millimes), 0) from public.commandes c join plateforme.boutiques b on b.id = c.boutique_id
                            where not b.demonstration and c.statut = 'livree'
                              and (coalesce(c.livree_at, c.cloturee_at) at time zone 'Africa/Tunis')::date = j.jour))
             order by j.jour)
        from (select generate_series(v_debut, v_fin, interval '1 day')::date as jour) j), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.console_sante(uuid) from public, anon, authenticated;
revoke execute on function public.console_tableau(uuid, integer) from public, anon, authenticated;
grant  execute on function public.console_sante(uuid) to service_role;
grant  execute on function public.console_tableau(uuid, integer) to service_role;
