-- =====================================================================
-- SkanEcom — 31 · LE TABLEAU DE BORD DE LA BOUTIQUE (B12, 1re partie)
-- 30/09/2026 — PRD §6.2 B12 (« tableau de bord des refus ») et §8 (« taux
-- de confirmation et de refus COD : l'argent gagné ou perdu par le client »)
-- =====================================================================
--
-- Le père de Skander demande : « combien on a vendu ce mois-ci, et combien
-- de colis sont revenus ? ». Cette fonction répond, sur une période (7, 30
-- ou 90 jours, à l'heure de Tunis), comparée à la précédente :
--   · les commandes reçues, confirmées, livrées, refusées, annulées, et
--     celles encore en route ;
--   · le taux de confirmation (confirmées parmi les commandes tranchées) et
--     le taux de refus à la livraison (refusées parmi les colis arrivés au
--     bout) ;
--   · l'argent : livré et encaissé, perdu en refus (le montant des colis
--     revenus), le panier moyen ;
--   · les refus par origine (client, livreur, injoignable) et par
--     gouvernorat, les produits qui partent, le délai de confirmation ;
--   · jour par jour, les commandes reçues et livrées.
-- Les commandes sont comptées au jour où elles ont été passées (une cohorte
-- par période) : une commande passée dans la période et livrée après
-- compte dans la période.
--
-- L'équipe de direction lit (propriétaire, administrateur, lecture) : la
-- confirmation et la préparation n'ont pas besoin du chiffre d'affaires.

create function public.gestion_tableau_de_bord(p_boutique_id uuid, p_jours integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_jours   integer := case when p_jours in (7, 30, 90) then p_jours else 30 end;
  v_aujourd date := (now() at time zone 'Africa/Tunis')::date;
  v_debut   timestamptz := ((v_aujourd - (v_jours - 1)) :: timestamp) at time zone 'Africa/Tunis';
  v_avant   timestamptz := ((v_aujourd - (2 * v_jours - 1)) :: timestamp) at time zone 'Africa/Tunis';
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,lecture}');

  return (
    with periode as (
      select c.*, case when c.created_at >= v_debut then 'courante' else 'precedente' end as tranche
        from public.commandes c
       where c.boutique_id = p_boutique_id and c.created_at >= v_avant and c.statut <> 'a_arbitrer'
    ), chiffres as (
      select p.tranche,
             count(*)                                                        as recues,
             count(*) filter (where p.confirmee_at is not null)              as confirmees,
             count(*) filter (where p.statut = 'livree')                     as livrees,
             count(*) filter (where p.statut = 'refusee')                    as refusees,
             count(*) filter (where p.statut = 'annulee')                    as annulees,
             count(*) filter (where p.statut in ('recue', 'confirmee', 'expediee')) as en_cours,
             count(*) filter (where p.statut = 'recue')                      as a_confirmer,
             coalesce(sum(p.total_millimes) filter (where p.statut = 'livree'), 0)  as encaisse,
             coalesce(sum(p.total_millimes) filter (where p.statut = 'refusee'), 0) as perdu,
             coalesce(round(avg(p.total_millimes) filter (where p.statut <> 'annulee')), 0) as panier_moyen,
             percentile_cont(0.5) within group (order by extract(epoch from p.confirmee_at - p.created_at) / 60)
               filter (where p.confirmee_at is not null)                     as confirmation_minutes
        from periode p group by p.tranche
    ), synthese as (
      select c.tranche, jsonb_build_object(
               'recues', c.recues, 'confirmees', c.confirmees, 'livrees', c.livrees, 'refusees', c.refusees,
               'annulees', c.annulees, 'en_cours', c.en_cours, 'a_confirmer', c.a_confirmer,
               'encaisse_millimes', c.encaisse, 'perdu_millimes', c.perdu, 'panier_moyen_millimes', c.panier_moyen,
               -- Confirmées parmi les commandes tranchées (confirmées, ou annulées sans l'être).
               'taux_confirmation', case when c.recues - c.a_confirmer > 0
                                         then round(c.confirmees::numeric / (c.recues - c.a_confirmer), 3) end,
               -- Refusées parmi les colis arrivés au bout (livrés ou refusés).
               'taux_refus', case when c.livrees + c.refusees > 0 then round(c.refusees::numeric / (c.livrees + c.refusees), 3) end,
               'confirmation_minutes', round(c.confirmation_minutes::numeric)) as j
        from chiffres c
    )
    select jsonb_build_object(
      'jours', v_jours,
      'du', v_aujourd - (v_jours - 1),
      'au', v_aujourd,
      'courante', coalesce((select s.j from synthese s where s.tranche = 'courante'), '{}'::jsonb),
      'precedente', coalesce((select s.j from synthese s where s.tranche = 'precedente'), '{}'::jsonb),
      'par_jour', (
        select jsonb_agg(jsonb_build_object(
                 'jour', d.jour,
                 'recues', (select count(*) from periode p where p.tranche = 'courante' and (p.created_at at time zone 'Africa/Tunis')::date = d.jour),
                 'livrees', (select count(*) from periode p where p.tranche = 'courante' and p.statut = 'livree'
                                and (p.created_at at time zone 'Africa/Tunis')::date = d.jour))
               order by d.jour)
          from (select gs::date as jour
                  from generate_series((v_aujourd - (v_jours - 1))::timestamp, v_aujourd::timestamp, interval '1 day') gs) d),
      'refus_origines', coalesce((
        select jsonb_agg(jsonb_build_object('origine', x.origine, 'refus', x.n) order by x.n desc, x.origine)
          from (select p.refus_origine::text as origine, count(*) as n from periode p
                 where p.tranche = 'courante' and p.statut = 'refusee' group by 1) x), '[]'::jsonb),
      'gouvernorats', coalesce((
        select jsonb_agg(jsonb_build_object('code', x.code, 'nom', x.nom, 'arrivees', x.arrivees, 'refusees', x.refusees,
                                            'taux_refus', round(x.refusees::numeric / x.arrivees, 3))
                         order by x.refusees desc, x.arrivees desc, x.nom)
          from (select p.livraison_gouvernorat as code, coalesce(g.nom_fr, p.livraison_gouvernorat) as nom,
                       count(*) as arrivees, count(*) filter (where p.statut = 'refusee') as refusees
                  from periode p left join public.gouvernorats g on g.code = p.livraison_gouvernorat
                 where p.tranche = 'courante' and p.statut in ('livree', 'refusee') and p.mode_livraison = 'domicile'
                 group by 1, 2 order by 4 desc, 3 desc limit 6) x), '[]'::jsonb),
      'produits', coalesce((
        select jsonb_agg(jsonb_build_object('produit', x.produit, 'quantite', x.q, 'montant_millimes', x.m) order by x.q desc, x.produit)
          from (select l.produit_nom as produit, sum(l.quantite) as q, sum(l.total_ligne_millimes) as m
                  from periode p join public.commande_lignes l on l.boutique_id = p.boutique_id and l.commande_id = p.id
                 where p.tranche = 'courante' and p.statut = 'livree'
                 group by 1 order by 2 desc, 1 limit 5) x), '[]'::jsonb)
    )
  );
end;
$$;

comment on function public.gestion_tableau_de_bord(uuid, integer) is
  'Le tableau de bord d''une boutique sur 7, 30 ou 90 jours (heure de Tunis), comparé à la période précédente : commandes, taux de confirmation et de refus, argent encaissé et perdu, refus par origine et par gouvernorat, produits.';

revoke execute on function public.gestion_tableau_de_bord(uuid, integer) from public, anon;
grant  execute on function public.gestion_tableau_de_bord(uuid, integer) to authenticated, service_role;
