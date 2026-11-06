-- =====================================================================
-- LE DIAGNOSTIC D'UNE BOUTIQUE — « pourquoi ce client ne reçoit rien ? »
--
-- Tout ce qui fait qu'une boutique vend (ou non), lu d'un coup : son
-- adresse et son certificat, son statut, une maintenance, ses conditions,
-- ses erreurs et ses pannes, ses files d'envoi, qui reçoit ses e-mails,
-- son catalogue en stock, sa livraison, son paiement en ligne, sa dernière
-- commande. La console y ajoute l'essai réel de sa page d'accueil, et dit
-- pour chaque point ce qu'il faut faire (console, fiche → Diagnostic).
-- =====================================================================

create function public.console_diagnostic(p_acteur uuid, p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b plateforme.boutiques;
  v_version_cg integer;
begin
  perform private.console_exige_admin(p_acteur);
  select * into b from plateforme.boutiques x where x.id = p_boutique_id;
  if b.id is null then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  select max(c.version) into v_version_cg from plateforme.conditions_service c where c.publie_le is not null;

  return jsonb_build_object(
    'boutique', jsonb_build_object('id', b.id, 'slug', b.slug, 'nom', b.nom, 'statut', b.statut, 'demonstration', b.demonstration,
                                   'suspension_motif', b.suspension_motif),
    'domaine', (select jsonb_build_object('hote', d.hote, 'type', d.type, 'statut', d.statut_certificat,
                                          'verifie_le', d.certificat_verifie_le, 'erreur', d.certificat_erreur)
                  from plateforme.domaines d where d.boutique_id = b.id order by d.principal desc, d.hote limit 1),
    'domaines', (select count(*) from plateforme.domaines d where d.boutique_id = b.id),
    'maintenance', (select jsonb_build_object('depuis', m.depuis, 'message', m.message) from plateforme.maintenances m where m.boutique_id = b.id),
    'maintenance_plateforme', exists (select 1 from plateforme.reglages_plateforme r where r.cle = 'maintenance' and r.valeur ? 'depuis'),
    'conditions', jsonb_build_object(
      'publiee', v_version_cg,
      'acceptee', (select max(a.version) from plateforme.conditions_acceptations a where a.boutique_id = b.id)),
    'erreurs_24h', (select coalesce(sum(e.nombre), 0) from plateforme.erreurs e
                     where e.boutique_id = b.id and e.reglee_le is null and e.derniere_le >= now() - interval '24 hours'),
    'derniere_erreur', (select jsonb_build_object('message', e.message, 'surface', e.surface, 'le', e.derniere_le)
                          from plateforme.erreurs e where e.boutique_id = b.id and e.reglee_le is null order by e.derniere_le desc limit 1),
    'pannes', (select count(*) from plateforme.incidents i where i.boutique_id = b.id and i.clos_le is null),
    'surveillance', (select jsonb_build_object('ok', r.ok, 'detail', r.detail, 'duree_ms', r.duree_ms, 'le', p.debut)
                       from plateforme.surveillance_releves r join plateforme.surveillance_passages p on p.id = r.passage_id
                      where r.boutique_id = b.id and r.genre = 'page' order by r.id desc limit 1),
    'courriels', jsonb_build_object(
      'dus', (select count(*) from public.courriels_commandes c where c.boutique_id = b.id and c.etat = 'a_envoyer'),
      'retentes', (select count(*) from public.courriels_commandes c where c.boutique_id = b.id and c.etat = 'a_envoyer' and c.essais > 0),
      'refuses_7j', (select count(*) from public.courriels_commandes c where c.boutique_id = b.id and c.etat = 'refuse' and c.fait_le >= now() - interval '7 days'),
      'sans_adresse_7j', (select count(*) from public.courriels_commandes c where c.boutique_id = b.id and c.etat = 'sans_adresse' and c.fait_le >= now() - interval '7 days'),
      'derniere_erreur', (select c.erreur from public.courriels_commandes c where c.boutique_id = b.id and c.erreur is not null order by c.id desc limit 1),
      -- Qui reçoit les e-mails de l'équipe (propriétaires et administrateurs actifs, avec une adresse).
      'destinataires', (select count(*) from plateforme.membres m join auth.users u on u.id = m.user_id
                         where m.boutique_id = b.id and m.actif and m.role in ('proprietaire', 'admin') and u.email is not null),
      'domaine_envoi', (select jsonb_build_object('domaine', cb.domaine, 'statut', cb.statut, 'actif', cb.domaine_actif)
                          from plateforme.courriels_boutique cb where cb.boutique_id = b.id and cb.domaine is not null)),
    'skanfact', jsonb_build_object(
      'etat', (select s.etat from plateforme.skanfact_connexions s where s.boutique_id = b.id),
      'dus', (select count(*) from public.skanfact_envois e where e.boutique_id = b.id and e.etat = 'a_envoyer'),
      'refuses', (select count(*) from public.skanfact_envois e where e.boutique_id = b.id and e.etat = 'refuse')),
    'catalogue', jsonb_build_object(
      'publies', (select count(*) from public.produits p where p.boutique_id = b.id and p.publie),
      'en_stock', (select count(distinct p.id) from public.produits p join public.variantes v on v.produit_id = p.id
                    where p.boutique_id = b.id and p.publie and v.actif and v.stock > 0)),
    'livraison', jsonb_build_object(
      'zones', (select count(*) from public.zones_livraison z where z.boutique_id = b.id and z.actif),
      'site_vitrine', coalesce((private.reglage(b.id, 'vitrine.site_vitrine'))::boolean, false)),
    'paiement', jsonb_build_object(
      'module', exists (select 1 from plateforme.modules_actifs ma where ma.boutique_id = b.id and ma.module = 'paiement_en_ligne' and ma.actif),
      'actif', coalesce((private.reglage(b.id, 'paiement.konnect_actif'))::boolean, false),
      'compte', exists (select 1 from plateforme.konnect_comptes k where k.boutique_id = b.id)),
    'commandes', jsonb_build_object(
      'derniere', (select max(c.created_at) from public.commandes c where c.boutique_id = b.id),
      'sept_jours', (select count(*) from public.commandes c where c.boutique_id = b.id and c.created_at >= now() - interval '7 days')),
    'le', now());
end;
$$;
revoke execute on function public.console_diagnostic(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.console_diagnostic(uuid, uuid) to service_role;
