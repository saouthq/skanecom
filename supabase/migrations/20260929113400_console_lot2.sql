-- =====================================================================
-- LA CONSOLE, LOT 2 — corrections de la relecture (05/10)
--
-- · Le support aide sans engager : il ne relie ni ne délie un client
--   SkanFact, ne touche pas à l'abonnement, ne marque pas une boutique de
--   démonstration, et ne donne jamais le rôle propriétaire ou administrateur
--   d'une boutique (ni ne retire ou ne change celui qui l'a).
-- · Une annonce peut porter un lien : la contrainte était invalide pour
--   Postgres (au plus 255 répétitions) ; elle refuse aussi « //ailleurs »
--   et « /\ailleurs », qui sortiraient de la plateforme.
-- · Arrêter une annonce programmée l'arrête vraiment ; son état se lit par
--   sa fin d'abord.
-- · Le tableau de bord : la courbe se calcule en une passe par période,
--   plus une passe par jour ; les ruptures comptent par boutique (index).
-- · Cloner ne reprend ni l'identité commerciale (revendeur officiel,
--   préfixe des numéros, annonce de la vitrine) ni les moyens de paiement.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.console_garder_contrat(p_acteur uuid, p_boutique_id uuid, p_contrat uuid, p_objet text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_avant uuid;
begin
  perform private.console_exige_super_admin(p_acteur);
  select l.contrat into v_avant from plateforme.facturation_liens l where l.boutique_id = p_boutique_id for update;
  if not found then
    raise exception 'La boutique n''est reliée à aucun client SkanFact' using errcode = 'check_violation', hint = 'lien';
  end if;
  if v_avant is not distinct from p_contrat then
    return;
  end if;
  update plateforme.facturation_liens l set contrat = p_contrat where l.boutique_id = p_boutique_id;
  perform private.console_trace(p_acteur, p_boutique_id,
    case when p_contrat is null then 'facturation.abonnement_oublie' else 'facturation.abonnement' end,
    nullif(btrim(coalesce(p_objet, '')), ''),
    case when v_avant is null then null else jsonb_build_object('contrat', v_avant) end,
    case when p_contrat is null then null else jsonb_build_object('contrat', p_contrat) end);
end;
$function$;

CREATE OR REPLACE FUNCTION public.console_noter_abonnement(p_acteur uuid, p_boutique_id uuid, p_geste text, p_objet text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.console_exige_super_admin(p_acteur);
  if p_geste not in ('suspendu', 'repris') then
    raise exception 'Geste inconnu : %', p_geste using errcode = 'check_violation';
  end if;
  if not exists (select 1 from plateforme.facturation_liens l where l.boutique_id = p_boutique_id and l.contrat is not null) then
    raise exception 'La boutique n''a pas d''abonnement suivi' using errcode = 'check_violation', hint = 'lien';
  end if;
  perform private.console_trace(p_acteur, p_boutique_id, 'facturation.abonnement_' || p_geste, nullif(btrim(coalesce(p_objet, '')), ''), null, null);
end;
$function$;

CREATE OR REPLACE FUNCTION public.console_delier_skanfact(p_acteur uuid, p_boutique_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_avant plateforme.facturation_liens;
begin
  perform private.console_exige_super_admin(p_acteur);
  delete from plateforme.facturation_liens l where l.boutique_id = p_boutique_id returning * into v_avant;
  if v_avant.boutique_id is null then
    return;
  end if;
  perform private.console_trace(p_acteur, p_boutique_id, 'facturation.delier', v_avant.raison_sociale,
    jsonb_build_object('client', v_avant.client, 'raison_sociale', v_avant.raison_sociale), null);
end;
$function$;

CREATE OR REPLACE FUNCTION public.console_marquer_demonstration(p_acteur uuid, p_boutique_id uuid, p_demonstration boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_avant boolean;
begin
  perform private.console_exige_super_admin(p_acteur);
  if p_demonstration is null then
    raise exception 'Démonstration ou cliente ?' using errcode = 'check_violation';
  end if;
  select b.demonstration into v_avant from plateforme.boutiques b where b.id = p_boutique_id for update;
  if not found then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  if v_avant = p_demonstration then
    return;
  end if;
  update plateforme.boutiques set demonstration = p_demonstration where id = p_boutique_id;
  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.demonstration',
    case when p_demonstration then 'démonstration' else 'cliente' end,
    jsonb_build_object('demonstration', v_avant), jsonb_build_object('demonstration', p_demonstration));
end;
$function$;

CREATE OR REPLACE FUNCTION public.console_lier_skanfact(p_acteur uuid, p_boutique_id uuid, p_client uuid, p_raison_sociale text, p_identifiant text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_demo  boolean;
  v_avant plateforme.facturation_liens;
begin
  perform private.console_exige_super_admin(p_acteur);
  select b.demonstration into v_demo from plateforme.boutiques b where b.id = p_boutique_id;
  if not found then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  if v_demo then
    raise exception 'Une boutique de démonstration n''a pas de client à facturer' using errcode = 'check_violation', hint = 'demonstration';
  end if;
  if p_client is null or nullif(btrim(coalesce(p_raison_sociale, '')), '') is null then
    raise exception 'Le client SkanFact et sa raison sociale sont attendus' using errcode = 'check_violation';
  end if;
  select * into v_avant from plateforme.facturation_liens l where l.boutique_id = p_boutique_id;
  if v_avant.client = p_client then
    return;
  end if;
  insert into plateforme.facturation_liens (boutique_id, client, raison_sociale, identifiant, lie_par)
  values (p_boutique_id, p_client, btrim(p_raison_sociale), nullif(btrim(coalesce(p_identifiant, '')), ''), p_acteur)
  on conflict (boutique_id) do update
    set client = excluded.client, raison_sociale = excluded.raison_sociale, identifiant = excluded.identifiant,
        lie_le = now(), lie_par = excluded.lie_par, contrat = null;
  -- La situation d'un autre client ne vaut plus.
  delete from plateforme.facturation_situations s where s.boutique_id = p_boutique_id;
  perform private.console_trace(p_acteur, p_boutique_id, 'facturation.lier', btrim(p_raison_sociale),
    case when v_avant.boutique_id is null then null else jsonb_build_object('client', v_avant.client, 'raison_sociale', v_avant.raison_sociale) end,
    jsonb_build_object('client', p_client, 'raison_sociale', btrim(p_raison_sociale)));
end;
$function$;

create or replace function public.console_ajouter_membre(p_acteur uuid, p_boutique_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if private.console_exige_admin(p_acteur) <> 'super_admin' and p_role in ('proprietaire', 'admin') then
    raise exception 'Seul un super-administrateur donne le rôle propriétaire ou administrateur : le support invite les rôles de travail'
      using errcode = 'insufficient_privilege';
  end if;
  perform private.equipe_ajouter(p_acteur, p_boutique_id, p_user_id, p_role);
end;
$$;

create or replace function public.console_modifier_membre(
  p_acteur uuid, p_boutique_id uuid, p_user_id uuid, p_role text, p_actif boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant text;
begin
  if private.console_exige_admin(p_acteur) <> 'super_admin' then
    select m.role::text into v_avant from plateforme.membres m where m.boutique_id = p_boutique_id and m.user_id = p_user_id;
    if coalesce(p_role, '') in ('proprietaire', 'admin') or v_avant in ('proprietaire', 'admin') then
      raise exception 'Seul un super-administrateur change ou retire un propriétaire ou un administrateur'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  perform private.equipe_modifier(p_acteur, p_boutique_id, p_user_id, p_role, p_actif);
end;
$$;

alter table plateforme.annonces drop constraint annonces_lien_check;
alter table plateforme.annonces add constraint annonces_lien_check check (
  lien is null or (length(lien) <= 300 and lien ~ '^(https://[^/\s]+(/\S*)?|/[^/\\\s]\S*)$')
);

CREATE OR REPLACE FUNCTION public.console_arreter_annonce(p_acteur uuid, p_annonce_id bigint, p_supprimer boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.console_exige_admin(p_acteur);
  if p_supprimer then
    delete from plateforme.annonces where id = p_annonce_id;
  else
    -- Programmée, elle ne paraît jamais : son début recule juste avant sa fin.
    update plateforme.annonces set debut = least(debut, now() - interval '1 second'), fin = now()
     where id = p_annonce_id and (fin is null or fin > now());
  end if;
  if not found and p_supprimer then
    raise exception 'Annonce introuvable' using errcode = 'no_data_found';
  end if;
  perform private.console_trace(p_acteur, null, case when p_supprimer then 'annonce.supprimer' else 'annonce.arreter' end, p_annonce_id::text, null, null);
end;
$function$;

CREATE OR REPLACE FUNCTION public.console_annonces(p_acteur uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.console_exige_admin(p_acteur);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'titre', a.titre, 'texte', a.texte, 'niveau', a.niveau, 'lien', a.lien,
             'debut', a.debut, 'fin', a.fin,
             'etat', case when a.fin is not null and a.fin <= now() then 'finie' when a.debut > now() then 'prevue' else 'en_cours' end,
             'cible', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'nom', b.nom) order by b.nom)
                                  from plateforme.boutiques b where b.id = any (a.cible)), 'null'::jsonb),
             'fermee_par', (select count(*) from plateforme.annonces_fermees f where f.annonce_id = a.id),
             'auteur', (select u.email from auth.users u where u.id = a.auteur))
           order by (a.fin is not null and a.fin <= now()), a.debut desc)
      from plateforme.annonces a), '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.console_sante(p_acteur uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                     and exists (select 1 from public.variantes v where v.boutique_id = p.boutique_id and v.produit_id = p.id and v.actif)
                     and not exists (select 1 from public.variantes v where v.boutique_id = p.boutique_id and v.produit_id = p.id and v.actif and v.stock > 0)),
      'publies', (select count(*) from public.produits p where p.boutique_id = b.id and p.publie),
      'formule', b.formule
    ) order by b.nom)
    from plateforme.boutiques b), '[]'::jsonb);
end;
$function$;

CREATE OR REPLACE FUNCTION public.console_tableau(p_acteur uuid, p_jours integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      with jours as (select generate_series(v_debut, v_fin, interval '1 day')::date as jour),
      recues as (
        select (c.created_at at time zone 'Africa/Tunis')::date as jour, count(*) as n
          from public.commandes c join plateforme.boutiques b on b.id = c.boutique_id
         where not b.demonstration and c.statut <> 'annulee' and c.created_at >= v_d and c.created_at < v_f
         group by 1),
      chiffre as (
        select (coalesce(c.livree_at, c.cloturee_at) at time zone 'Africa/Tunis')::date as jour, sum(c.total_millimes) as s
          from public.commandes c join plateforme.boutiques b on b.id = c.boutique_id
         where not b.demonstration and c.statut = 'livree'
           and coalesce(c.livree_at, c.cloturee_at) >= v_d and coalesce(c.livree_at, c.cloturee_at) < v_f
         group by 1)
      select jsonb_agg(jsonb_build_object('jour', j.jour, 'recues', coalesce(r.n, 0), 'chiffre', coalesce(ch.s, 0)) order by j.jour)
        from jours j left join recues r on r.jour = j.jour left join chiffre ch on ch.jour = j.jour), '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.console_cloner_configuration(p_acteur uuid, p_source uuid, p_cible uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  t        public.themes;
  v_map    jsonb := '{}'::jsonb;
  v_zones  jsonb := '{}'::jsonb;
  v_attrs  jsonb := '{}'::jsonb;
  r        record;
  v_id     uuid;
  n_reg    integer := 0;
  n_cat    integer := 0;
  n_zon    integer := 0;
  n_att    integer := 0;
begin
  perform private.console_exige_admin(p_acteur);
  if p_source = p_cible then
    raise exception 'Une boutique ne se clone pas dans elle-même' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from plateforme.boutiques b where b.id = p_source)
     or not exists (select 1 from plateforme.boutiques b where b.id = p_cible) then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from public.produits p where p.boutique_id = p_cible)
     or exists (select 1 from public.categories c where c.boutique_id = p_cible) then
    raise exception 'La boutique d''arrivée n''est pas vide : la configuration ne se clone que dans une boutique neuve'
      using errcode = 'check_violation', hint = 'non_vide';
  end if;

  -- L'apparence, sans images : celles de la source restent les siennes.
  select * into t from public.themes x where x.boutique_id = p_source;
  if found then
    update public.themes set code = t.code, couleurs = t.couleurs, polices = t.polices, style = t.style, textes = t.textes
     where boutique_id = p_cible;
  end if;

  -- Les réglages, sans l'identité de la source.
  insert into public.reglages (boutique_id, cle, valeur)
  select p_cible, r2.cle, r2.valeur from public.reglages r2
   where r2.boutique_id = p_source
     and r2.cle !~ '^(legal|contact|pub|retrait|paiement)\.'
     and r2.cle not in ('catalogue.revendeur_officiel', 'commande.prefixe_numero', 'vitrine.annonce')
  on conflict (boutique_id, cle) do update set valeur = excluded.valeur;
  get diagnostics n_reg = row_count;

  -- La livraison.
  for r in select * from public.zones_livraison z where z.boutique_id = p_source order by z.position, z.created_at loop
    insert into public.zones_livraison (boutique_id, nom_fr, nom_ar, frais_millimes, delai_jours_min, delai_jours_max, actif, position)
    values (p_cible, r.nom_fr, r.nom_ar, r.frais_millimes, r.delai_jours_min, r.delai_jours_max, r.actif, r.position)
    returning id into v_id;
    v_zones := v_zones || jsonb_build_object(r.id::text, v_id);
    n_zon := n_zon + 1;
  end loop;
  insert into public.zones_gouvernorats (boutique_id, gouvernorat_code, zone_id)
  select p_cible, zg.gouvernorat_code, (v_zones ->> zg.zone_id::text)::uuid
    from public.zones_gouvernorats zg where zg.boutique_id = p_source and v_zones ? zg.zone_id::text;
  insert into public.tranches_poids (boutique_id, jusqu_a_grammes, supplement_millimes)
  select p_cible, tp.jusqu_a_grammes, tp.supplement_millimes from public.tranches_poids tp where tp.boutique_id = p_source;

  -- Les rayons, les parents d'abord (sans leurs images).
  for r in
    with recursive arbre as (
      select c.*, 0 as profondeur from public.categories c where c.boutique_id = p_source and c.parent_id is null
      union all
      select c.*, a.profondeur + 1 from public.categories c join arbre a on c.parent_id = a.id where c.boutique_id = p_source
    )
    select * from arbre order by profondeur, position
  loop
    insert into public.categories (boutique_id, parent_id, slug, nom_fr, nom_ar, description_fr, description_ar, position, actif)
    values (p_cible, case when r.parent_id is null then null else (v_map ->> r.parent_id::text)::uuid end,
            r.slug, r.nom_fr, r.nom_ar, r.description_fr, r.description_ar, r.position, r.actif)
    returning id into v_id;
    v_map := v_map || jsonb_build_object(r.id::text, v_id);
    n_cat := n_cat + 1;
  end loop;

  -- Les caractéristiques, et leurs rayons.
  for r in select * from public.attributs a where a.boutique_id = p_source order by a.position, a.created_at loop
    insert into public.attributs (boutique_id, cle, label_fr, label_ar, unite, type, filtrable, en_carte, position)
    values (p_cible, r.cle, r.label_fr, r.label_ar, r.unite, r.type, r.filtrable, r.en_carte, r.position)
    returning id into v_id;
    v_attrs := v_attrs || jsonb_build_object(r.id::text, v_id);
    n_att := n_att + 1;
  end loop;
  insert into public.rayon_attributs (boutique_id, categorie_id, attribut_id)
  select p_cible, (v_map ->> ra.categorie_id::text)::uuid, (v_attrs ->> ra.attribut_id::text)::uuid
    from public.rayon_attributs ra
   where ra.boutique_id = p_source and v_map ? ra.categorie_id::text and v_attrs ? ra.attribut_id::text;

  perform private.console_trace(p_acteur, p_cible, 'boutique.cloner', p_source::text, null,
    jsonb_build_object('source', (select b.slug from plateforme.boutiques b where b.id = p_source),
                       'reglages', n_reg, 'rayons', n_cat, 'zones', n_zon, 'caracteristiques', n_att));
  return jsonb_build_object('reglages', n_reg, 'rayons', n_cat, 'zones', n_zon, 'caracteristiques', n_att);
end;
$function$;
