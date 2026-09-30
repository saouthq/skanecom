-- =====================================================================
-- SkanEcom — 36 · LES COMPTES PROFESSIONNELS (module comptes_pro)
-- 30/09/2026 — étude 05 §2.3 et §3 (décidé le 29/09) : « plombiers,
-- électriciens : comptes pro validés par le commerçant, prix pro par
-- variante »
-- =====================================================================
--
-- Le module se vend (console, C3) ; activé :
--   · le client connecté de la vitrine demande un compte professionnel
--     (raison sociale, matricule fiscal, métier, un mot) ;
--   · la boutique valide ou refuse, depuis sa fiche client, et peut retirer
--     un compte plus tard (un motif, au journal) ; elle peut aussi ouvrir
--     d'emblée le compte d'un client qu'elle connaît ;
--   · chaque déclinaison peut avoir son prix pro. Ils vivent dans une table à
--     part (public.prix_pro) : la table des déclinaisons se lit en vitrine
--     par tout le monde, un prix pro n'y aurait pas sa place ;
--   · le devis (private.chiffre_commande) applique le prix pro à un pro
--     validé, connecté — jamais plus cher que le prix public —, et le dit
--     (« tarif » pro, l'économie) ; la commande garde le prix appliqué ;
--   · la vitrine lit les prix pro d'un produit pour son pro connecté
--     (public.mes_prix_pro) et rien pour les autres.
-- Module coupé : plus aucun prix pro ne s'applique, rien ne s'efface.

update plateforme.modules set disponible = true where code = 'comptes_pro';


-- ---------------------------------------------------------------------
-- Les comptes
-- ---------------------------------------------------------------------
create table public.comptes_pro (
  id               uuid primary key default gen_random_uuid(),
  boutique_id      uuid not null references plateforme.boutiques (id) on delete cascade,
  client_id        uuid not null,
  statut           text not null default 'demande'
                   constraint comptes_pro_statut check (statut in ('demande', 'valide', 'refuse', 'retire')),
  raison_sociale   text not null constraint comptes_pro_raison check (char_length(raison_sociale) between 2 and 120),
  matricule_fiscal text constraint comptes_pro_matricule check (char_length(matricule_fiscal) between 5 and 30),
  metier           text constraint comptes_pro_metier check (char_length(metier) <= 80),
  message          text constraint comptes_pro_message check (char_length(message) <= 500),
  motif            text constraint comptes_pro_motif check (char_length(motif) <= 300),
  demande_le       timestamptz not null default now(),
  decide_le        timestamptz,
  decide_par       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (boutique_id, id),
  unique (boutique_id, client_id),
  foreign key (boutique_id, client_id) references public.clients (boutique_id, id) on delete cascade
);

comment on table public.comptes_pro is
  'Un compte professionnel par client : demandé depuis la vitrine (ou ouvert par la boutique), validé, refusé ou retiré par la boutique. Écrit seulement par les fonctions.';

create index comptes_pro_statut_idx on public.comptes_pro (boutique_id, statut, demande_le);

create trigger comptes_pro_updated_at
  before update on public.comptes_pro
  for each row execute function private.set_updated_at();
create trigger comptes_pro_boutique_immuable
  before update of boutique_id on public.comptes_pro
  for each row execute function private.boutique_immuable();


-- ---------------------------------------------------------------------
-- Les prix pro, à part des déclinaisons
-- ---------------------------------------------------------------------
create table public.prix_pro (
  id            uuid primary key default gen_random_uuid(),
  boutique_id   uuid not null references plateforme.boutiques (id) on delete cascade,
  variante_id   uuid not null,
  prix_millimes bigint not null constraint prix_pro_positif check (prix_millimes > 0),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,
  unique (boutique_id, id),
  unique (boutique_id, variante_id),
  foreign key (boutique_id, variante_id) references public.variantes (boutique_id, id) on delete cascade
);

comment on table public.prix_pro is
  'Le prix d''une déclinaison pour les comptes professionnels validés. Jamais lu par la vitrine directement : public.mes_prix_pro et le devis.';

create trigger prix_pro_updated_at
  before update on public.prix_pro
  for each row execute function private.set_updated_at();
create trigger prix_pro_boutique_immuable
  before update of boutique_id on public.prix_pro
  for each row execute function private.boutique_immuable();

-- L'équipe lit ceux de sa boutique ; personne n'écrit par l'API.
alter table public.comptes_pro enable row level security;
alter table public.prix_pro    enable row level security;
create policy "comptes_pro: l'équipe lit ceux de sa boutique"
  on public.comptes_pro for select using (boutique_id in (select private.mes_boutiques()));
create policy "prix_pro: l'équipe lit ceux de sa boutique"
  on public.prix_pro for select using (boutique_id in (select private.mes_boutiques()));
revoke insert, update, delete, truncate on public.comptes_pro, public.prix_pro from anon, authenticated;


-- ---------------------------------------------------------------------
-- Qui est pro ici ?
-- ---------------------------------------------------------------------
create function private.comptes_pro_actif(p_boutique_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from plateforme.modules_actifs ma
                  where ma.boutique_id = p_boutique_id and ma.module = 'comptes_pro' and ma.actif)
$$;

-- La personne connectée est-elle un pro validé de cette boutique (module
-- actif, client non bloqué) ?
create function private.est_pro(p_boutique_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and private.comptes_pro_actif(p_boutique_id)
     and exists (select 1 from public.comptes_pro cp
                   join public.clients cl on cl.boutique_id = cp.boutique_id and cl.id = cp.client_id
                  where cp.boutique_id = p_boutique_id and cl.user_id = auth.uid()
                    and cp.statut = 'valide' and cl.niveau_risque <> 'bloque')
$$;

revoke execute on function private.comptes_pro_actif(uuid) from public, anon, authenticated;
revoke execute on function private.est_pro(uuid)           from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- La vitrine : son compte pro, sa demande, ses prix
-- ---------------------------------------------------------------------
create function public.mon_compte_pro(p_boutique_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
           'statut', cp.statut, 'raison_sociale', cp.raison_sociale, 'matricule_fiscal', cp.matricule_fiscal,
           'metier', cp.metier, 'message', cp.message,
           -- Le motif d'un refus ou d'un retrait est dit au client ; rien d'autre de l'équipe.
           'motif', case when cp.statut in ('refuse', 'retire') then cp.motif end,
           'demande_le', cp.demande_le, 'decide_le', cp.decide_le)
    from public.comptes_pro cp
    join public.clients cl on cl.boutique_id = cp.boutique_id and cl.id = cp.client_id
   where cp.boutique_id = p_boutique_id and cl.user_id = auth.uid() and auth.uid() is not null
     and private.comptes_pro_actif(p_boutique_id)
$$;

create function public.demander_compte_pro(
  p_boutique_id      uuid,
  p_raison_sociale   text,
  p_matricule_fiscal text default null,
  p_metier           text default null,
  p_message          text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_raison    text := nullif(btrim(regexp_replace(coalesce(p_raison_sociale, ''), '\s+', ' ', 'g')), '');
  v_matricule text := nullif(upper(regexp_replace(coalesce(p_matricule_fiscal, ''), '\s+', '', 'g')), '');
  v_metier    text := nullif(btrim(coalesce(p_metier, '')), '');
  v_message   text := nullif(btrim(coalesce(p_message, '')), '');
  v_tel       text;
  v_client    public.clients;
  v_avant     text;
begin
  if v_uid is null then
    raise exception 'Connectez-vous avec votre numéro pour demander un compte professionnel'
      using errcode = 'insufficient_privilege', hint = 'compte';
  end if;
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active')
     or not private.comptes_pro_actif(p_boutique_id) then
    raise exception 'Cette boutique n''ouvre pas de compte professionnel en ligne' using errcode = 'check_violation', hint = 'module';
  end if;
  if v_raison is null or char_length(v_raison) not between 2 and 120 then
    raise exception 'Indiquez le nom de votre entreprise (2 à 120 caractères)' using errcode = 'check_violation', hint = 'raison_sociale';
  end if;
  if v_matricule is not null and char_length(v_matricule) not between 5 and 30 then
    raise exception 'Matricule fiscal illisible (5 à 30 caractères, par exemple 1234567A/M/000)'
      using errcode = 'check_violation', hint = 'matricule';
  end if;
  if char_length(coalesce(v_metier, '')) > 80 then
    raise exception 'Métier trop long (80 caractères au plus)' using errcode = 'check_violation', hint = 'metier';
  end if;
  if char_length(coalesce(v_message, '')) > 500 then
    raise exception 'Message trop long (500 caractères au plus)' using errcode = 'check_violation', hint = 'message';
  end if;

  -- La fiche client du compte : créée si le client n'a encore rien commandé.
  v_tel := private.telephone_tunisien((select u.phone from auth.users u where u.id = v_uid));
  select * into v_client from public.clients c where c.boutique_id = p_boutique_id and c.user_id = v_uid;
  if not found then
    if v_tel is null then
      raise exception 'Connectez-vous avec votre numéro pour demander un compte professionnel'
        using errcode = 'insufficient_privilege', hint = 'compte';
    end if;
    insert into public.clients (boutique_id, user_id, telephone) values (p_boutique_id, v_uid, v_tel)
    returning * into v_client;
  end if;
  if v_client.niveau_risque = 'bloque' then
    raise exception 'Ce compte ne peut pas faire de demande en ligne : contactez la boutique'
      using errcode = 'insufficient_privilege', hint = 'bloque';
  end if;

  select cp.statut into v_avant from public.comptes_pro cp
   where cp.boutique_id = p_boutique_id and cp.client_id = v_client.id for update;
  if v_avant = 'valide' then
    raise exception 'Votre compte professionnel est déjà ouvert' using errcode = 'check_violation', hint = 'deja';
  end if;

  -- Une demande en attente se complète ; après un refus ou un retrait, on
  -- redemande (la boutique tranche de nouveau).
  insert into public.comptes_pro as cp (boutique_id, client_id, raison_sociale, matricule_fiscal, metier, message)
  values (p_boutique_id, v_client.id, v_raison, v_matricule, v_metier, v_message)
  on conflict (boutique_id, client_id) do update
    set statut = 'demande', raison_sociale = excluded.raison_sociale, matricule_fiscal = excluded.matricule_fiscal,
        metier = excluded.metier, message = excluded.message,
        motif = null, decide_le = null, decide_par = null,
        demande_le = case when cp.statut = 'demande' then cp.demande_le else now() end;

  return public.mon_compte_pro(p_boutique_id);
end;
$$;

-- Les prix pro des produits demandés, pour le pro connecté : un objet
-- { variante_id: prix appliqué } (jamais plus que le prix public) ; vide
-- pour tous les autres.
create function public.mes_prix_pro(p_boutique_id uuid, p_produits uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(v.id, least(pp.prix_millimes, v.prix_millimes)), '{}'::jsonb)
    from public.prix_pro pp
    join public.variantes v on v.boutique_id = pp.boutique_id and v.id = pp.variante_id and v.actif
    join public.produits  p on p.boutique_id = v.boutique_id and p.id = v.produit_id and p.publie
   where pp.boutique_id = p_boutique_id
     and v.produit_id = any (p_produits[1:60])
     and pp.prix_millimes < v.prix_millimes
     and private.est_pro(p_boutique_id)
$$;

revoke execute on function public.mon_compte_pro(uuid)                          from public, anon;
revoke execute on function public.demander_compte_pro(uuid, text, text, text, text) from public, anon;
revoke execute on function public.mes_prix_pro(uuid, uuid[])                     from public;
grant  execute on function public.mon_compte_pro(uuid)                          to authenticated, service_role;
grant  execute on function public.demander_compte_pro(uuid, text, text, text, text) to authenticated, service_role;
grant  execute on function public.mes_prix_pro(uuid, uuid[])                     to anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- Le devis : le prix pro pour un pro validé (migration 35, reprise ; ce
-- qui change : le prix appliqué, le prix public à côté, le tarif et
-- l'économie)
-- ---------------------------------------------------------------------
create or replace function private.chiffre_commande(p_boutique_id uuid, p_lignes jsonb, p_gouvernorat text, p_retrait boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lignes     jsonb;
  v_sous_total bigint;
  v_complet    boolean;
  v_gouv       public.gouvernorats;
  v_frais      bigint;
  v_seuil      bigint := (private.reglage(p_boutique_id, 'livraison.seuil_gratuite_millimes') #>> '{}')::bigint;
  v_zone       jsonb;
  v_retrait    jsonb;
  v_poids      integer;
  v_supplement bigint := 0;
  v_pro        boolean := private.est_pro(p_boutique_id);
  v_economie   bigint;
begin
  with demandees as (
    select d.variante_id, d.quantite from private.lignes_panier(p_lignes) d
  ), lues as (
    select d.variante_id, d.quantite,
           coalesce(v.actif and p.publie, false) as vendable,
           v.stock, v.sku, p.slug, v.poids_grammes,
           v.prix_millimes as prix_public,
           -- Le prix pro, pour un pro : jamais plus cher que le prix public.
           case when v_pro then least(coalesce(pp.prix_millimes, v.prix_millimes), v.prix_millimes)
                else v.prix_millimes end as prix_millimes,
           coalesce(v.quantite_min, 1) as quantite_min,
           coalesce(p.nom_fr, p.nom_ar) as produit_nom,
           (select string_agg(v.options ->> o.cle, ' · ' order by o.position, o.cle)
              from public.produit_options o
             where o.boutique_id = v.boutique_id and o.produit_id = v.produit_id
               and v.options ? o.cle) as libelle,
           coalesce(v.image_chemin,
             (select i.chemin from public.produit_images i
               where i.boutique_id = v.boutique_id and i.produit_id = v.produit_id
               order by (i.variante_id is not distinct from v.id) desc, i.position, i.created_at
               limit 1)) as image
    from demandees d
    left join public.variantes v on v.boutique_id = p_boutique_id and v.id = d.variante_id
    left join public.produits  p on p.boutique_id = v.boutique_id and p.id = v.produit_id
    left join public.prix_pro pp on pp.boutique_id = v.boutique_id and pp.variante_id = v.id
  )
  select
    jsonb_agg(jsonb_build_object(
      'variante_id',            l.variante_id,
      'disponible',             l.vendable and l.stock > 0 and l.stock >= l.quantite_min,
      'quantite',               l.quantite,
      'quantite_disponible',    case when l.vendable and l.stock >= l.quantite_min then least(l.quantite, l.stock) else 0 end,
      'quantite_min',           case when l.vendable then l.quantite_min end,
      'produit_nom',            case when l.vendable then l.produit_nom end,
      'produit_slug',           case when l.vendable then l.slug end,
      'variante_libelle',       case when l.vendable then l.libelle end,
      'sku',                    case when l.vendable then l.sku end,
      'image',                  case when l.vendable then l.image end,
      'prix_unitaire_millimes', case when l.vendable then l.prix_millimes end,
      'prix_public_millimes',   case when l.vendable and l.prix_millimes < l.prix_public then l.prix_public end,
      'total_ligne_millimes',   case when l.vendable then l.prix_millimes * l.quantite end
    ) order by l.produit_nom nulls last, l.sku, l.variante_id),
    coalesce(sum(case when l.vendable then l.prix_millimes * l.quantite end), 0),
    bool_and(l.vendable and l.stock >= l.quantite and l.quantite >= l.quantite_min),
    coalesce(sum(case when l.vendable then coalesce(l.poids_grammes, 0) * l.quantite end), 0)::integer,
    coalesce(sum(case when l.vendable then (l.prix_public - l.prix_millimes) * l.quantite end), 0)
  into v_lignes, v_sous_total, v_complet, v_poids, v_economie
  from lues l;

  if p_retrait then
    -- Retrait en magasin : gratuit, au magasin de la boutique.
    v_retrait := private.retrait_propose(p_boutique_id);
    if v_retrait is null then
      raise exception 'Le retrait en magasin n''est pas proposé par cette boutique'
        using errcode = 'check_violation', hint = 'retrait';
    end if;
    v_frais := 0;
  elsif p_gouvernorat is not null then
    select * into v_gouv from public.gouvernorats g where g.code = p_gouvernorat and g.actif;
    if not found then
      raise exception 'Gouvernorat inconnu' using errcode = 'check_violation', hint = 'adresse';
    end if;
    v_frais := public.frais_livraison_millimes(p_boutique_id, v_gouv.code, v_sous_total, v_poids);
    v_supplement := case when v_frais > 0 then private.supplement_poids(p_boutique_id, v_poids) else 0 end;
    select jsonb_build_object('nom_fr', z.nom_fr, 'nom_ar', z.nom_ar,
                              'delai_jours_min', z.delai_jours_min, 'delai_jours_max', z.delai_jours_max)
      into v_zone
      from public.zones_gouvernorats zg
      join public.zones_livraison z on z.boutique_id = zg.boutique_id and z.id = zg.zone_id and z.actif
     where zg.boutique_id = p_boutique_id and zg.gouvernorat_code = v_gouv.code;
  end if;

  return jsonb_build_object(
    'lignes',                   v_lignes,
    'complet',                  v_complet,
    'sous_total_millimes',      v_sous_total,
    'seuil_gratuite_millimes',  case when v_seuil > 0 then v_seuil end,
    'gouvernorat',              case when v_gouv.code is not null then
                                  jsonb_build_object('code', v_gouv.code, 'nom_fr', v_gouv.nom_fr, 'nom_ar', v_gouv.nom_ar) end,
    'zone',                     v_zone,
    'mode',                     case when p_retrait then 'retrait' else 'domicile' end,
    'retrait',                  v_retrait,
    'frais_livraison_millimes', v_frais,
    'poids_grammes',            v_poids,
    'supplement_poids_millimes', v_supplement,
    'tarif',                    case when v_pro then 'pro' else 'public' end,
    'economie_pro_millimes',    case when v_pro and v_economie > 0 then v_economie end,
    'total_millimes',           v_sous_total + v_frais
  );
end;
$$;


-- ---------------------------------------------------------------------
-- Le backoffice : l'état du module, les comptes, une décision
-- ---------------------------------------------------------------------
create function public.gestion_pro_etat(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', private.comptes_pro_actif(p_boutique_id),
    'demandes', (select count(*) from public.comptes_pro cp where cp.boutique_id = p_boutique_id and cp.statut = 'demande'));
end;
$$;

create function public.gestion_comptes_pro(p_boutique_id uuid, p_filtre text default 'demandes')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  if p_filtre is null or p_filtre not in ('demandes', 'valides', 'refuses') then
    raise exception 'Filtre inconnu : %', p_filtre using errcode = 'check_violation', hint = 'filtre';
  end if;
  return jsonb_build_object(
    'filtre', p_filtre,
    'actif', private.comptes_pro_actif(p_boutique_id),
    'compteurs', (select jsonb_build_object(
        'demandes', count(*) filter (where cp.statut = 'demande'),
        'valides',  count(*) filter (where cp.statut = 'valide'),
        'refuses',  count(*) filter (where cp.statut in ('refuse', 'retire')))
      from public.comptes_pro cp where cp.boutique_id = p_boutique_id),
    'comptes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'client_id', cl.id, 'nom', cl.nom, 'telephone', cl.telephone,
               'statut', cp.statut, 'raison_sociale', cp.raison_sociale, 'matricule_fiscal', cp.matricule_fiscal,
               'metier', cp.metier, 'message', cp.message, 'motif', cp.motif,
               'demande_le', cp.demande_le, 'decide_le', cp.decide_le,
               'commandes', cl.nb_commandes, 'refus', cl.nb_refus, 'niveau_risque', cl.niveau_risque)
             order by case when p_filtre = 'demandes' then cp.demande_le end,
                      coalesce(cp.decide_le, cp.demande_le) desc, cp.id)
        from public.comptes_pro cp
        join public.clients cl on cl.boutique_id = cp.boutique_id and cl.id = cp.client_id
       where cp.boutique_id = p_boutique_id
         and case p_filtre when 'demandes' then cp.statut = 'demande'
                           when 'valides'  then cp.statut = 'valide'
                           else cp.statut in ('refuse', 'retire') end), '[]'::jsonb));
end;
$$;

-- Le compte pro d'un client, pour sa fiche : avec le journal des décisions.
create function public.gestion_compte_pro(p_boutique_id uuid, p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', private.comptes_pro_actif(p_boutique_id),
    'compte', (select jsonb_build_object(
                 'statut', cp.statut, 'raison_sociale', cp.raison_sociale, 'matricule_fiscal', cp.matricule_fiscal,
                 'metier', cp.metier, 'message', cp.message, 'motif', cp.motif,
                 'demande_le', cp.demande_le, 'decide_le', cp.decide_le,
                 'decide_par', (select u.email from auth.users u where u.id = cp.decide_par))
                 from public.comptes_pro cp where cp.boutique_id = p_boutique_id and cp.client_id = p_client_id),
    'journal', coalesce((
      select jsonb_agg(jsonb_build_object('le', ja.at, 'avant', ja.avant, 'apres', ja.apres,
                                          'auteur', (select u.email from auth.users u where u.id = ja.acteur))
             order by ja.at desc)
        from plateforme.journal_audit ja
       where ja.boutique_id = p_boutique_id and ja.action = 'clients.compte_pro' and ja.cible = p_client_id::text), '[]'::jsonb));
end;
$$;

-- Valider, refuser, retirer, rouvrir — ou ouvrir d'emblée le compte d'un
-- client que la boutique connaît (raison sociale fournie). L'étape vue à
-- l'écran est revérifiée : deux décisions croisées, la seconde est refusée.
create function public.gestion_decider_compte_pro(
  p_boutique_id    uuid,
  p_client_id      uuid,
  p_decision       text,
  p_motif          text default null,
  p_statut_vu      text default null,
  p_raison_sociale text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cp     public.comptes_pro;
  v_motif  text := nullif(btrim(coalesce(p_motif, '')), '');
  v_raison text := nullif(btrim(regexp_replace(coalesce(p_raison_sociale, ''), '\s+', ' ', 'g')), '');
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if not private.comptes_pro_actif(p_boutique_id) then
    raise exception 'Le module des comptes professionnels n''est pas actif' using errcode = 'check_violation', hint = 'module';
  end if;
  if p_decision is null or p_decision not in ('valide', 'refuse', 'retire') then
    raise exception 'Décision inconnue : %', p_decision using errcode = 'check_violation', hint = 'decision';
  end if;
  if not exists (select 1 from public.clients c where c.boutique_id = p_boutique_id and c.id = p_client_id) then
    raise exception 'Client introuvable' using errcode = 'no_data_found', hint = 'client';
  end if;
  if char_length(coalesce(v_motif, '')) > 300 then
    raise exception 'Motif trop long (300 caractères au plus)' using errcode = 'check_violation', hint = 'motif';
  end if;

  select * into v_cp from public.comptes_pro cp
   where cp.boutique_id = p_boutique_id and cp.client_id = p_client_id for update;
  if p_statut_vu is not null and v_cp.statut is distinct from nullif(p_statut_vu, 'aucun') then
    raise exception 'Le compte a changé entre-temps : il est à jour ci-dessous' using errcode = 'check_violation', hint = 'change';
  end if;

  if v_cp.id is null then
    -- Ouvrir d'emblée le compte d'un client : seulement le valider.
    if p_decision <> 'valide' then
      raise exception 'Ce client n''a pas de compte professionnel' using errcode = 'check_violation', hint = 'etat';
    end if;
    if v_raison is null or char_length(v_raison) not between 2 and 120 then
      raise exception 'Indiquez la raison sociale du client (2 à 120 caractères)' using errcode = 'check_violation', hint = 'raison_sociale';
    end if;
    insert into public.comptes_pro (boutique_id, client_id, statut, raison_sociale, decide_le, decide_par)
    values (p_boutique_id, p_client_id, 'valide', v_raison, now(), auth.uid());
  else
    if (p_decision = 'valide' and v_cp.statut = 'valide')
       or (p_decision = 'refuse' and v_cp.statut <> 'demande')
       or (p_decision = 'retire' and v_cp.statut <> 'valide') then
      raise exception 'Ce geste ne vaut pas pour un compte %', v_cp.statut using errcode = 'check_violation', hint = 'etat';
    end if;
    if p_decision in ('refuse', 'retire') and v_motif is null then
      raise exception 'Dites pourquoi : le client le lira dans son compte' using errcode = 'check_violation', hint = 'motif';
    end if;
    update public.comptes_pro set
      statut = p_decision, motif = case when p_decision = 'valide' then null else v_motif end,
      raison_sociale = coalesce(case when p_decision = 'valide' then v_raison end, raison_sociale),
      decide_le = now(), decide_par = auth.uid()
    where boutique_id = p_boutique_id and id = v_cp.id;
  end if;

  perform private.console_trace(auth.uid(), p_boutique_id, 'clients.compte_pro', p_client_id::text,
    case when v_cp.id is not null then jsonb_build_object('statut', v_cp.statut) end,
    jsonb_build_object('statut', p_decision, 'motif', v_motif));
end;
$$;

-- La fiche produit lit le prix pro de chaque déclinaison (migration 35, reprise).
create or replace function public.gestion_produit(p_boutique_id uuid, p_produit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_p      public.produits;
  v_sortie jsonb;
begin
  perform private.catalogue_exige(p_boutique_id);
  select * into v_p from public.produits p where p.boutique_id = p_boutique_id and p.id = p_produit_id;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'id', v_p.id, 'slug', v_p.slug, 'nom', coalesce(v_p.nom_fr, v_p.nom_ar), 'description', v_p.description_fr,
    'marque', v_p.marque, 'categorie_id', v_p.categorie_id, 'publie', v_p.publie, 'mis_en_avant', v_p.mis_en_avant,
    'version', v_p.updated_at, 'cree_le', v_p.created_at,
    'axes', coalesce((select jsonb_agg(jsonb_build_object('cle', o.cle, 'label', coalesce(o.label_fr, o.label_ar),
                                         'valeurs', (select coalesce(jsonb_agg(distinct v.options ->> o.cle), '[]'::jsonb)
                                                       from public.variantes v
                                                      where v.boutique_id = p_boutique_id and v.produit_id = v_p.id and v.options ? o.cle))
                                       order by o.position, o.cle)
                        from public.produit_options o where o.boutique_id = p_boutique_id and o.produit_id = v_p.id), '[]'::jsonb),
    'variantes', coalesce((select jsonb_agg(jsonb_build_object(
                             'id', v.id, 'sku', v.sku, 'options', v.options,
                             'libelle', private.libelle_variante(p_boutique_id, v_p.id, v.options),
                             'prix', v.prix_millimes, 'prix_barre', v.prix_barre_millimes, 'stock', v.stock,
                             'seuil', v.seuil_alerte_stock, 'actif', v.actif, 'poids', v.poids_grammes,
                             'minimum', v.quantite_min,
                             'prix_pro', (select pp.prix_millimes from public.prix_pro pp
                                           where pp.boutique_id = v.boutique_id and pp.variante_id = v.id))
                           order by v.position, v.sku)
                           from public.variantes v where v.boutique_id = p_boutique_id and v.produit_id = v_p.id), '[]'::jsonb),
    'images', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'chemin', i.chemin, 'variante_id', i.variante_id, 'alt', i.alt_fr)
                        order by i.position, i.created_at)
                        from public.produit_images i where i.boutique_id = p_boutique_id and i.produit_id = v_p.id), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', c.id,
                              'nom', case when par.id is null then coalesce(c.nom_fr, c.nom_ar)
                                          else coalesce(par.nom_fr, par.nom_ar) || ' › ' || coalesce(c.nom_fr, c.nom_ar) end)
                            order by coalesce(par.position, c.position), coalesce(par.nom_fr, c.nom_fr), par.id nulls first, c.position, c.nom_fr)
                            from public.categories c
                            left join public.categories par on par.boutique_id = c.boutique_id and par.id = c.parent_id
                           where c.boutique_id = p_boutique_id), '[]'::jsonb),
    'mouvements', coalesce((select jsonb_agg(m order by m ->> 'le' desc)
                            from (select jsonb_build_object(
                                           'le', s.created_at, 'sku', v.sku,
                                           'libelle', private.libelle_variante(p_boutique_id, v_p.id, v.options),
                                           'delta', s.delta, 'stock_apres', s.stock_apres, 'motif', s.motif, 'commentaire', s.commentaire,
                                           'commande', (select c.numero from public.commandes c where c.boutique_id = s.boutique_id and c.id = s.commande_id),
                                           'auteur', (select u.email from auth.users u where u.id = s.auteur_id)) as m
                                    from public.stock_mouvements s
                                    join public.variantes v on v.boutique_id = s.boutique_id and v.id = s.variante_id
                                   where s.boutique_id = p_boutique_id and v.produit_id = v_p.id
                                   order by s.created_at desc
                                   limit 30) derniers), '[]'::jsonb)
  ) into v_sortie;
  return v_sortie;
end;
$$;

-- Le prix pro d'une déclinaison : NULL le retire.
create function public.gestion_enregistrer_prix_pro(p_boutique_id uuid, p_variante_id uuid, p_prix_pro bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_prix bigint;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select v.prix_millimes into v_prix from public.variantes v
   where v.boutique_id = p_boutique_id and v.id = p_variante_id;
  if v_prix is null then
    raise exception 'Déclinaison introuvable' using errcode = 'no_data_found', hint = 'variante';
  end if;
  if p_prix_pro is null then
    delete from public.prix_pro where boutique_id = p_boutique_id and variante_id = p_variante_id;
    return;
  end if;
  if p_prix_pro <= 0 or p_prix_pro >= v_prix then
    raise exception 'Le prix pro se situe entre zéro et le prix public' using errcode = 'check_violation', hint = 'prix_pro';
  end if;
  insert into public.prix_pro (boutique_id, variante_id, prix_millimes, updated_by)
  values (p_boutique_id, p_variante_id, p_prix_pro, auth.uid())
  on conflict (boutique_id, variante_id) do update
    set prix_millimes = excluded.prix_millimes, updated_by = excluded.updated_by;
end;
$$;

revoke execute on function public.gestion_pro_etat(uuid)                                        from public, anon;
revoke execute on function public.gestion_comptes_pro(uuid, text)                               from public, anon;
revoke execute on function public.gestion_compte_pro(uuid, uuid)                                from public, anon;
revoke execute on function public.gestion_decider_compte_pro(uuid, uuid, text, text, text, text) from public, anon;
revoke execute on function public.gestion_enregistrer_prix_pro(uuid, uuid, bigint)              from public, anon;
grant  execute on function public.gestion_pro_etat(uuid)                                        to authenticated;
grant  execute on function public.gestion_comptes_pro(uuid, text)                               to authenticated;
grant  execute on function public.gestion_compte_pro(uuid, uuid)                                to authenticated;
grant  execute on function public.gestion_decider_compte_pro(uuid, uuid, text, text, text, text) to authenticated;
grant  execute on function public.gestion_enregistrer_prix_pro(uuid, uuid, bigint)              to authenticated;
