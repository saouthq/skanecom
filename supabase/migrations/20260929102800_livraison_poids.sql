-- =====================================================================
-- SkanEcom — 29 · LIVRAISON : LE SUPPLÉMENT SELON LE POIDS
-- 30/09/2026 — étude 05 (D17 : « frais par poids, seuil de gratuité », M)
-- =====================================================================
--
-- Un compresseur de 30 kg ne coûte pas au livreur ce que coûte une boîte
-- de vis. La boutique peut ajouter au tarif de livraison (fixe, ou celui de
-- la zone) un SUPPLÉMENT selon le poids du colis, par tranches :
--     jusqu'à 5 kg : rien · jusqu'à 10 kg : + 3 TND · au-delà : + 8 TND
-- C'est un réglage (livraison.supplement_poids, coupé par défaut) : la
-- boutique qui préfère un tarif simple garde le sien.
--
-- Le poids du colis est la somme des poids des déclinaisons commandées
-- (variantes.poids_grammes ; une déclinaison sans poids compte pour rien).
-- La livraison offerte dès le seuil reste offerte, supplément compris ; le
-- retrait en magasin reste gratuit. Plus lourd que la dernière tranche
-- bornée, sans tranche « au-delà » : la plus lourde s'applique.

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('livraison.supplement_poids', 'booleen', null, 'false', 'livraison', null, true,
     'Supplément selon le poids du colis',
     'Oui = les tranches de poids s''ajoutent au tarif de livraison (fixe ou de la zone). Non = le tarif seul.', 14);

create table public.tranches_poids (
  id                  uuid primary key default gen_random_uuid(),
  boutique_id         uuid not null references plateforme.boutiques (id) on delete cascade,
  jusqu_a_grammes     integer check (jusqu_a_grammes is null or jusqu_a_grammes between 1 and 1000000),
  supplement_millimes bigint not null check (supplement_millimes between 0 and 100000000),
  created_at          timestamptz not null default now(),
  unique (boutique_id, id)
);

comment on table public.tranches_poids is
  'Le supplément de livraison selon le poids du colis, par tranche (jusqu''à N grammes ; null = au-delà de toutes).';

-- Une tranche par borne, et une seule « au-delà ».
create unique index tranches_poids_borne_idx on public.tranches_poids (boutique_id, coalesce(jusqu_a_grammes, 2147483647));

create trigger tranches_poids_boutique_immuable before update of boutique_id on public.tranches_poids
  for each row execute function private.boutique_immuable();

alter table public.tranches_poids enable row level security;
create policy "tranches_poids: lecture publique"
  on public.tranches_poids for select
  using (boutique_id in (select private.boutiques_visibles()));
create policy "tranches_poids: l'équipe lit tout"
  on public.tranches_poids for select
  using (boutique_id in (select private.mes_boutiques()));
revoke insert, update, delete, truncate on public.tranches_poids from anon, authenticated;


-- ---------------------------------------------------------------------
-- Le supplément d'un colis, et les frais qui l'incluent
-- ---------------------------------------------------------------------
create function private.supplement_poids(p_boutique_id uuid, p_poids_grammes integer)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case when not coalesce((private.reglage(p_boutique_id, 'livraison.supplement_poids') #>> '{}')::boolean, false)
                   or p_poids_grammes is null then 0
              else coalesce(
                (select t.supplement_millimes from public.tranches_poids t
                  where t.boutique_id = p_boutique_id and (t.jusqu_a_grammes is null or t.jusqu_a_grammes >= p_poids_grammes)
                  order by t.jusqu_a_grammes nulls last limit 1),
                (select t.supplement_millimes from public.tranches_poids t
                  where t.boutique_id = p_boutique_id order by t.jusqu_a_grammes desc nulls first limit 1),
                0) end
$$;

revoke execute on function private.supplement_poids(uuid, integer) from public, anon, authenticated;

drop function public.frais_livraison_millimes(uuid, text, bigint);
create function public.frais_livraison_millimes(
  p_boutique_id          uuid,
  p_gouvernorat_code     text,
  p_sous_total_millimes  bigint default null,
  p_poids_grammes        integer default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fixe  bigint := (private.reglage(p_boutique_id, 'livraison.frais_fixes_millimes') #>> '{}')::bigint;
  v_seuil bigint := (private.reglage(p_boutique_id, 'livraison.seuil_gratuite_millimes') #>> '{}')::bigint;
  v_zone  bigint;
begin
  if v_seuil > 0 and p_sous_total_millimes >= v_seuil then
    return 0;
  end if;

  if private.reglage(p_boutique_id, 'livraison.mode_frais') #>> '{}' = 'zone' then
    select z.frais_millimes into v_zone
    from public.zones_gouvernorats zg
    join public.zones_livraison z
      on z.boutique_id = zg.boutique_id and z.id = zg.zone_id and z.actif
    where zg.boutique_id = p_boutique_id and zg.gouvernorat_code = p_gouvernorat_code;
  end if;

  return coalesce(v_zone, v_fixe) + private.supplement_poids(p_boutique_id, p_poids_grammes);
end;
$$;

comment on function public.frais_livraison_millimes(uuid, text, bigint, integer) is
  'Applique les réglages livraison.* de la boutique, supplément au poids compris. En mode zone, un gouvernorat non rattaché retombe sur le tarif fixe plutôt que sur zéro : jamais de livraison gratuite par accident de configuration.';

revoke execute on function public.frais_livraison_millimes(uuid, text, bigint, integer) from public;
grant  execute on function public.frais_livraison_millimes(uuid, text, bigint, integer) to anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- Le devis : le poids du colis et son supplément (migration 22, reprise)
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
begin
  with demandees as (
    select d.variante_id, d.quantite from private.lignes_panier(p_lignes) d
  ), lues as (
    select d.variante_id, d.quantite,
           coalesce(v.actif and p.publie, false) as vendable,
           v.stock, v.prix_millimes, v.sku, p.slug, v.poids_grammes,
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
  )
  select
    jsonb_agg(jsonb_build_object(
      'variante_id',            l.variante_id,
      'disponible',             l.vendable and l.stock > 0,
      'quantite',               l.quantite,
      'quantite_disponible',    case when l.vendable then least(l.quantite, l.stock) else 0 end,
      'produit_nom',            case when l.vendable then l.produit_nom end,
      'produit_slug',           case when l.vendable then l.slug end,
      'variante_libelle',       case when l.vendable then l.libelle end,
      'sku',                    case when l.vendable then l.sku end,
      'image',                  case when l.vendable then l.image end,
      'prix_unitaire_millimes', case when l.vendable then l.prix_millimes end,
      'total_ligne_millimes',   case when l.vendable then l.prix_millimes * l.quantite end
    ) order by l.produit_nom nulls last, l.sku, l.variante_id),
    coalesce(sum(case when l.vendable then l.prix_millimes * l.quantite end), 0),
    bool_and(l.vendable and l.stock >= l.quantite),
    coalesce(sum(case when l.vendable then coalesce(l.poids_grammes, 0) * l.quantite end), 0)::integer
  into v_lignes, v_sous_total, v_complet, v_poids
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
    'total_millimes',           v_sous_total + v_frais
  );
end;
$$;


-- ---------------------------------------------------------------------
-- La vitrine : les tranches en vigueur (migration 05, reprise)
-- ---------------------------------------------------------------------
create or replace function public.boutique_publique(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'boutique', jsonb_build_object(
      'id', b.id, 'slug', b.slug, 'nom', b.nom,
      'langue_defaut', b.langue_defaut, 'langues_actives', b.langues_actives, 'devise', b.devise,
      'hote_principal', (select d.hote from plateforme.domaines d where d.boutique_id = b.id and d.principal),
      'nb_produits', (select count(*) from public.produits p where p.boutique_id = b.id and p.publie)),
    'configuration', public.configuration_publique(b.id),
    'theme', (select to_jsonb(t) - 'boutique_id' - 'updated_by' from public.themes t where t.boutique_id = b.id),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'parent_id', c.parent_id, 'slug', c.slug,
               'nom_fr', c.nom_fr, 'nom_ar', c.nom_ar,
               'description_fr', c.description_fr, 'description_ar', c.description_ar,
               'image_chemin', c.image_chemin, 'position', c.position,
               'nb_produits', (select count(*) from public.produits p
                                where p.boutique_id = b.id and p.categorie_id = c.id and p.publie))
             order by c.position, c.slug)
      from public.categories c where c.boutique_id = b.id and c.actif), '[]'::jsonb),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nom_fr', z.nom_fr, 'nom_ar', z.nom_ar, 'frais_millimes', z.frais_millimes,
               'delai_jours_min', z.delai_jours_min, 'delai_jours_max', z.delai_jours_max)
             order by z.position)
      from public.zones_livraison z where z.boutique_id = b.id and z.actif), '[]'::jsonb),
    -- Le supplément au poids, s'il est en vigueur (conditions de vente, tunnel).
    'tranches_poids', case when coalesce((private.reglage(b.id, 'livraison.supplement_poids') #>> '{}')::boolean, false) then
      coalesce((select jsonb_agg(jsonb_build_object('jusqu_a_grammes', t.jusqu_a_grammes, 'supplement_millimes', t.supplement_millimes)
                                 order by t.jusqu_a_grammes nulls last)
                  from public.tranches_poids t where t.boutique_id = b.id), '[]'::jsonb) end
  )
  from plateforme.boutiques b
  where b.slug = p_slug and b.statut = 'active';
$$;


-- ---------------------------------------------------------------------
-- Le backoffice : les tranches, avec les réglages (migration 13, reprise)
-- ---------------------------------------------------------------------
create or replace function public.gestion_reglages(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'reglages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'cle', c.cle, 'valeur', coalesce(r.valeur, c.defaut), 'defaut', c.defaut, 'personnalise', r.cle is not null,
               'type', c.type_valeur, 'choix', c.choix_possibles, 'groupe', c.groupe, 'module', c.module,
               'module_actif', c.module is null or exists (select 1 from plateforme.modules_actifs ma
                                                           where ma.boutique_id = p_boutique_id and ma.module = c.module and ma.actif),
               'modifiable', c.modifiable_boutique,
               'libelle', c.libelle_fr, 'description', c.description_fr,
               'modifie_le', r.updated_at, 'modifie_par', (select u.email from auth.users u where u.id = r.updated_by))
             order by c.groupe, c.position, c.cle)
        from plateforme.reglages_catalogue c
        left join public.reglages r on r.boutique_id = p_boutique_id and r.cle = c.cle), '[]'::jsonb),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', z.id, 'nom', coalesce(z.nom_fr, z.nom_ar), 'frais', z.frais_millimes,
               'delai_min', z.delai_jours_min, 'delai_max', z.delai_jours_max, 'actif', z.actif,
               'gouvernorats', (select count(*) from public.zones_gouvernorats zg
                                 where zg.boutique_id = p_boutique_id and zg.zone_id = z.id))
             order by z.position, z.created_at)
        from public.zones_livraison z where z.boutique_id = p_boutique_id), '[]'::jsonb),
    'tranches', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'jusqu_a_grammes', t.jusqu_a_grammes, 'supplement', t.supplement_millimes)
                       order by t.jusqu_a_grammes nulls last)
        from public.tranches_poids t where t.boutique_id = p_boutique_id), '[]'::jsonb),
    'gouvernorats', coalesce((
      select jsonb_agg(jsonb_build_object('code', g.code, 'nom', g.nom_fr, 'zone_id', zg.zone_id) order by g.position)
        from public.gouvernorats g
        left join public.zones_gouvernorats zg on zg.boutique_id = p_boutique_id and zg.gouvernorat_code = g.code
       where g.actif), '[]'::jsonb),
    'journal', coalesce((
      select jsonb_agg(x order by x ->> 'le' desc) from (
        select jsonb_build_object('le', ja.at, 'action', ja.action, 'cible', ja.cible, 'avant', ja.avant, 'apres', ja.apres,
                                  'auteur', (select u.email from auth.users u where u.id = ja.acteur)) as x
          from plateforme.journal_audit ja
         where ja.boutique_id = p_boutique_id and ja.action like 'reglages.%'
         order by ja.at desc limit 15) j), '[]'::jsonb)
  );
end;
$$;

-- Créer (p_id null) ou modifier une tranche : jusqu'à N grammes (null : au-delà).
create function public.gestion_enregistrer_tranche(p_boutique_id uuid, p_id uuid, p_jusqu_a_grammes integer, p_supplement bigint)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant jsonb;
  v_id    uuid;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if p_jusqu_a_grammes is not null and (p_jusqu_a_grammes < 1 or p_jusqu_a_grammes > 1000000) then
    raise exception 'Poids invalide : de 1 g à 1 000 kg' using errcode = 'check_violation', hint = 'poids';
  end if;
  if p_supplement is null or p_supplement < 0 or p_supplement > 100000000 then
    raise exception 'Supplément invalide' using errcode = 'check_violation', hint = 'frais';
  end if;
  if exists (select 1 from public.tranches_poids t
              where t.boutique_id = p_boutique_id and t.id is distinct from p_id
                and t.jusqu_a_grammes is not distinct from p_jusqu_a_grammes) then
    raise exception '%', case when p_jusqu_a_grammes is null then 'Il y a déjà une tranche « au-delà »'
                              else 'Il y a déjà une tranche à ce poids' end
      using errcode = 'check_violation', hint = 'poids';
  end if;
  if (select count(*) from public.tranches_poids t where t.boutique_id = p_boutique_id) >= 12 and p_id is null then
    raise exception 'Douze tranches au plus' using errcode = 'check_violation', hint = 'trop';
  end if;

  if p_id is null then
    insert into public.tranches_poids (boutique_id, jusqu_a_grammes, supplement_millimes)
    values (p_boutique_id, p_jusqu_a_grammes, p_supplement)
    returning id into v_id;
  else
    select jsonb_build_object('jusqu_a_grammes', t.jusqu_a_grammes, 'supplement', t.supplement_millimes) into v_avant
      from public.tranches_poids t where t.boutique_id = p_boutique_id and t.id = p_id for update;
    if v_avant is null then
      raise exception 'Tranche introuvable' using errcode = 'no_data_found', hint = 'tranche';
    end if;
    update public.tranches_poids set jusqu_a_grammes = p_jusqu_a_grammes, supplement_millimes = p_supplement
     where boutique_id = p_boutique_id and id = p_id
    returning id into v_id;
  end if;
  perform private.console_trace(auth.uid(), p_boutique_id, 'reglages.tranche_poids',
    coalesce(p_jusqu_a_grammes::text, 'au-delà'), v_avant,
    jsonb_build_object('jusqu_a_grammes', p_jusqu_a_grammes, 'supplement', p_supplement));
  return v_id;
end;
$$;

create function public.gestion_supprimer_tranche(p_boutique_id uuid, p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant jsonb;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  delete from public.tranches_poids t where t.boutique_id = p_boutique_id and t.id = p_id
  returning jsonb_build_object('jusqu_a_grammes', t.jusqu_a_grammes, 'supplement', t.supplement_millimes) into v_avant;
  if v_avant is null then
    raise exception 'Tranche introuvable' using errcode = 'no_data_found', hint = 'tranche';
  end if;
  perform private.console_trace(auth.uid(), p_boutique_id, 'reglages.tranche_poids_supprimee',
    coalesce(v_avant ->> 'jusqu_a_grammes', 'au-delà'), v_avant, null);
end;
$$;

revoke execute on function public.gestion_enregistrer_tranche(uuid, uuid, integer, bigint) from public, anon;
revoke execute on function public.gestion_supprimer_tranche(uuid, uuid)                    from public, anon;
grant  execute on function public.gestion_enregistrer_tranche(uuid, uuid, integer, bigint) to authenticated, service_role;
grant  execute on function public.gestion_supprimer_tranche(uuid, uuid)                    to authenticated, service_role;
