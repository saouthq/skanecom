-- =====================================================================
-- SkanEcom — 71 · LES PRIX PAR QUANTITÉ (« 2 pour 99 DT »)
-- =====================================================================
--
-- Ce que vendent les pages des publicités Facebook et TikTok : la pièce
-- seule, ou deux, ou trois, chaque fois moins chère à l'unité. La boutique
-- fixe, pour un produit, trois paliers au plus — « 2 pièces : 99,000 »,
-- « 3 pièces : 129,000 » — et la base les applique d'elle-même au chiffrage
-- (private.chiffre_commande), si bien que le prix affiché est le prix payé :
--
--   · une ligne de Q pièces prend le palier le plus haut qui ne dépasse pas
--     Q, au prorata : Q = N exactement donne le prix du palier, au centime
--     (au millime) près ; Q au-delà du dernier palier garde son prix
--     unitaire ;
--   · jamais plus cher que sans palier (le prix pro, une remise de solde
--     déjà moins chers gardent la main) ; jamais sur une ligne d'un devis
--     (son prix est négocié) ;
--   · la ligne dit le palier appliqué et ce qu'elle aurait coûté sans lui.
--
-- 1. public.prix_quantite : les paliers d'un produit.
-- 2. Le chiffrage les applique.
-- 3. La vitrine les lit (public.vitrine_produits), le backoffice les règle
--    (gestion_paliers, gestion_enregistrer_paliers).

-- ---------------------------------------------------------------------
-- 1. Les paliers
-- ---------------------------------------------------------------------
create table public.prix_quantite (
  id            uuid primary key default gen_random_uuid(),
  boutique_id   uuid not null references plateforme.boutiques (id) on delete cascade,
  produit_id    uuid not null,
  quantite      integer not null constraint prix_quantite_quantite check (quantite between 2 and 50),
  prix_millimes bigint not null constraint prix_quantite_positif check (prix_millimes > 0),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,
  unique (boutique_id, id),
  unique (boutique_id, produit_id, quantite),
  foreign key (boutique_id, produit_id) references public.produits (boutique_id, id) on delete cascade
);

comment on table public.prix_quantite is
  'Les prix par quantité d''un produit : le prix TOTAL de N pièces (« 2 pour 99 DT »), trois paliers au plus. Appliqués par private.chiffre_commande.';

create trigger prix_quantite_updated_at
  before update on public.prix_quantite
  for each row execute function private.set_updated_at();
create trigger prix_quantite_boutique_immuable
  before update of boutique_id on public.prix_quantite
  for each row execute function private.boutique_immuable();

-- Tout le monde lit ceux des produits publiés (ce sont des prix affichés) ;
-- l'équipe lit tous ceux de sa boutique ; personne n'écrit par l'API.
alter table public.prix_quantite enable row level security;
create policy "prix_quantite: lecture des produits publiés"
  on public.prix_quantite for select
  using (exists (select 1 from public.produits p
                  where p.boutique_id = prix_quantite.boutique_id and p.id = prix_quantite.produit_id and p.publie));
create policy "prix_quantite: l'équipe lit ceux de sa boutique"
  on public.prix_quantite for select using (boutique_id in (select private.mes_boutiques()));
revoke insert, update, delete, truncate on public.prix_quantite from anon, authenticated;
grant select on public.prix_quantite to anon, authenticated;


-- ---------------------------------------------------------------------
-- 2. Le chiffrage : le palier de chaque ligne
-- ---------------------------------------------------------------------
create or replace function private.chiffre_commande(p_boutique_id uuid, p_lignes jsonb, p_gouvernorat text, p_retrait boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lignes      jsonb;
  v_sous_total  bigint;
  v_complet     boolean;
  v_gouv        public.gouvernorats;
  v_frais       bigint;
  v_seuil       bigint := (private.reglage(p_boutique_id, 'livraison.seuil_gratuite_millimes') #>> '{}')::bigint;
  v_zone        jsonb;
  v_retrait     jsonb;
  v_poids       integer;
  v_supplement  bigint := 0;
  v_pro         boolean := private.est_pro(p_boutique_id);
  v_economie    bigint;
  v_designe     text := nullif(current_setting('skanecom.devis_id', true), '');
  v_devis_id    uuid;
  v_devis_frais bigint;
begin
  -- Un devis ne vaut que s'il est envoyé, à son client connecté.
  if v_designe ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select d.id, d.frais_livraison_millimes into v_devis_id, v_devis_frais
      from public.devis d
      join public.clients cl on cl.boutique_id = d.boutique_id and cl.id = d.client_id
     where d.boutique_id = p_boutique_id and d.id = v_designe::uuid and d.statut = 'envoye'
       and cl.user_id = auth.uid() and auth.uid() is not null;
  end if;

  with demandees as (
    select d.variante_id, d.quantite from private.lignes_panier(p_lignes) d
  ), lues as (
    select d.variante_id, d.quantite,
           coalesce(v.actif and p.publie, false) as vendable,
           v.stock, v.sku, p.slug, v.poids_grammes,
           v.prix_millimes as prix_public,
           -- Le prix du devis ; sinon le prix pro, pour un pro (jamais plus
           -- cher que le prix public) ; sinon le prix public.
           case when dl.id is not null then dl.prix_devis_millimes
                when v_pro then least(coalesce(pp.prix_millimes, v.prix_millimes), v.prix_millimes)
                else v.prix_millimes end as prix_millimes,
           coalesce(v.quantite_min, 1) as quantite_min,
           dl.id is not null as au_devis,
           -- Le palier le plus haut qui ne dépasse pas la quantité (hors devis).
           case when dl.id is null then pal.quantite end as palier,
           case when dl.id is null then pal.prix_millimes end as palier_prix,
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
    left join public.devis_lignes dl on v_devis_id is not null and dl.boutique_id = v.boutique_id
                                     and dl.devis_id = v_devis_id and dl.variante_id = v.id
                                     and dl.quantite = d.quantite and dl.prix_devis_millimes is not null
    left join lateral (
      select q.quantite, q.prix_millimes from public.prix_quantite q
       where q.boutique_id = v.boutique_id and q.produit_id = v.produit_id and q.quantite <= d.quantite
       order by q.quantite desc limit 1
    ) pal on true
  ), chiffrees as (
    -- Le total de la ligne : au palier, au prorata, s'il est moins cher.
    select l.*,
           l.prix_millimes * l.quantite as total_sans_palier,
           least(l.prix_millimes * l.quantite,
                 coalesce(round(l.palier_prix::numeric * l.quantite / l.palier)::bigint, l.prix_millimes * l.quantite)) as total
      from lues l
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
      'prix_unitaire_millimes', case when l.vendable then
                                  case when l.total < l.total_sans_palier then round(l.total::numeric / l.quantite)::bigint
                                       else l.prix_millimes end end,
      'prix_public_millimes',   case when l.vendable and l.prix_millimes < l.prix_public then l.prix_public end,
      'palier',                 case when l.vendable and l.total < l.total_sans_palier then l.palier end,
      'total_sans_palier_millimes', case when l.vendable and l.total < l.total_sans_palier then l.total_sans_palier end,
      'total_ligne_millimes',   case when l.vendable then l.total end
    ) order by l.produit_nom nulls last, l.sku, l.variante_id),
    coalesce(sum(case when l.vendable then l.total end), 0),
    -- Au devis : chaque ligne doit en être (mêmes articles, mêmes quantités).
    bool_and(l.vendable and l.stock >= l.quantite and l.quantite >= l.quantite_min and (v_devis_id is null or l.au_devis)),
    coalesce(sum(case when l.vendable then coalesce(l.poids_grammes, 0) * l.quantite end), 0)::integer,
    coalesce(sum(case when l.vendable then (l.prix_public - l.prix_millimes) * l.quantite end), 0)
  into v_lignes, v_sous_total, v_complet, v_poids, v_economie
  from chiffrees l;

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
  -- Les frais fixés par le devis remplacent ceux de la boutique (à domicile).
  if v_devis_id is not null and v_devis_frais is not null and not p_retrait then
    v_frais := v_devis_frais;
    v_supplement := 0;
  end if;

  return jsonb_build_object(
    'lignes',                   v_lignes,
    'complet',                  v_complet,
    'sous_total_millimes',      v_sous_total,
    'seuil_gratuite_millimes',  case when v_seuil > 0 and v_devis_id is null then v_seuil end,
    'gouvernorat',              case when v_gouv.code is not null then
                                  jsonb_build_object('code', v_gouv.code, 'nom_fr', v_gouv.nom_fr, 'nom_ar', v_gouv.nom_ar) end,
    'zone',                     v_zone,
    'mode',                     case when p_retrait then 'retrait' else 'domicile' end,
    'retrait',                  v_retrait,
    'frais_livraison_millimes', v_frais,
    'poids_grammes',            v_poids,
    'supplement_poids_millimes', v_supplement,
    'tarif',                    case when v_devis_id is not null then 'devis' when v_pro then 'pro' else 'public' end,
    'economie_pro_millimes',    case when v_pro and v_devis_id is null and v_economie > 0 then v_economie end,
    'total_millimes',           v_sous_total + v_frais
  );
end;
$$;


-- ---------------------------------------------------------------------
-- 3. La vitrine les lit ; le backoffice les règle
-- ---------------------------------------------------------------------
create or replace view public.vitrine_produits
with (security_invoker = true) as
select
  p.boutique_id, p.id, p.slug, p.nom_fr, p.nom_ar, p.description_fr, p.description_ar,
  p.marque, p.mis_en_avant, p.position, p.created_at, p.meta_titre_fr, p.meta_description_fr,
  (select jsonb_build_object('id', c.id, 'parent_id', c.parent_id, 'slug', c.slug, 'nom_fr', c.nom_fr, 'nom_ar', c.nom_ar)
     from public.categories c
    where c.boutique_id = p.boutique_id and c.id = p.categorie_id and c.actif) as categorie,
  coalesce((select jsonb_agg(jsonb_build_object('cle', o.cle, 'label_fr', o.label_fr, 'label_ar', o.label_ar)
                             order by o.position, o.cle)
              from public.produit_options o
             where o.boutique_id = p.boutique_id and o.produit_id = p.id), '[]'::jsonb) as options,
  coalesce((select jsonb_agg(jsonb_build_object(
                     'id', v.id, 'sku', v.sku, 'options', v.options,
                     'prix_millimes', v.prix_millimes, 'prix_barre_millimes', v.prix_barre_millimes,
                     'stock', v.stock, 'seuil_alerte_stock', v.seuil_alerte_stock,
                     'poids_grammes', v.poids_grammes, 'image_chemin', v.image_chemin,
                     'quantite_min', v.quantite_min)
                   order by v.position, v.sku)
              from public.variantes v
             where v.boutique_id = p.boutique_id and v.produit_id = p.id and v.actif), '[]'::jsonb) as variantes,
  coalesce((select jsonb_agg(jsonb_build_object('chemin', i.chemin, 'variante_id', i.variante_id,
                                                'alt_fr', i.alt_fr, 'alt_ar', i.alt_ar)
                             order by i.position, i.chemin)
              from public.produit_images i
             where i.boutique_id = p.boutique_id and i.produit_id = p.id), '[]'::jsonb) as images,
  coalesce((select jsonb_agg(jsonb_build_object('cle', a.cle, 'label_fr', a.label_fr, 'label_ar', a.label_ar,
                                                'unite', a.unite, 'type', a.type, 'en_carte', a.en_carte,
                                                'valeur', p.caracteristiques ->> a.cle)
                             order by a.position, a.label_fr)
              from public.attributs a
             where a.boutique_id = p.boutique_id and p.caracteristiques ? a.cle), '[]'::jsonb) as caracteristiques,
  public.note_produit(p.boutique_id, p.id) as note,
  coalesce((select jsonb_agg(jsonb_build_object('quantite', q.quantite, 'prix_millimes', q.prix_millimes) order by q.quantite)
              from public.prix_quantite q
             where q.boutique_id = p.boutique_id and q.produit_id = p.id), '[]'::jsonb) as paliers
from public.produits p
where p.publie;

-- Les paliers d'un produit, pour sa fiche au backoffice.
create function public.gestion_paliers(p_boutique_id uuid, p_produit_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return coalesce((select jsonb_agg(jsonb_build_object('quantite', q.quantite, 'prix_millimes', q.prix_millimes) order by q.quantite)
                     from public.prix_quantite q
                    where q.boutique_id = p_boutique_id and q.produit_id = p_produit_id), '[]'::jsonb);
end;
$$;

-- Les paliers d'un produit, d'un coup (la liste remplace l'ancienne ;
-- vide : plus de prix par quantité). Trois au plus, chacun de 2 à 50
-- pièces ; plus on en prend, moins l'unité coûte ; et chaque palier est
-- une vraie remise pour une déclinaison au moins.
create function public.gestion_enregistrer_paliers(p_boutique_id uuid, p_produit_id uuid, p_paliers jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_max_prix   bigint;
  v_precedent  numeric;
  v_palier     record;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if not exists (select 1 from public.produits p where p.boutique_id = p_boutique_id and p.id = p_produit_id) then
    raise exception 'Produit introuvable' using errcode = 'no_data_found', hint = 'produit';
  end if;
  if jsonb_typeof(p_paliers) is distinct from 'array' or jsonb_array_length(p_paliers) > 3 then
    raise exception 'Trois prix par quantité au plus' using errcode = 'check_violation', hint = 'paliers';
  end if;
  if exists (select 1 from jsonb_array_elements(p_paliers) x
              where jsonb_typeof(x) <> 'object'
                 or exists (select 1 from jsonb_object_keys(x) k where k not in ('quantite', 'prix_millimes'))
                 or jsonb_typeof(x -> 'quantite') is distinct from 'number' or jsonb_typeof(x -> 'prix_millimes') is distinct from 'number'
                 or (x ->> 'quantite') !~ '^[0-9]+$' or (x ->> 'prix_millimes') !~ '^[0-9]+$'
                 or (x ->> 'quantite')::integer not between 2 and 50 or (x ->> 'prix_millimes')::bigint <= 0) then
    raise exception 'Un prix par quantité : de 2 à 50 pièces, un prix positif' using errcode = 'check_violation', hint = 'paliers';
  end if;
  if (select count(distinct x ->> 'quantite') from jsonb_array_elements(p_paliers) x) <> jsonb_array_length(p_paliers) then
    raise exception 'Deux prix pour la même quantité' using errcode = 'check_violation', hint = 'paliers';
  end if;

  select max(v.prix_millimes) into v_max_prix from public.variantes v
   where v.boutique_id = p_boutique_id and v.produit_id = p_produit_id and v.actif;
  v_precedent := v_max_prix;
  for v_palier in
    select (x ->> 'quantite')::integer as quantite, (x ->> 'prix_millimes')::bigint as prix
      from jsonb_array_elements(p_paliers) x order by 1
  loop
    if v_max_prix is null or v_palier.prix >= v_palier.quantite * v_max_prix then
      raise exception '% pièces à ce prix ne coûtent pas moins qu''à l''unité', v_palier.quantite
        using errcode = 'check_violation', hint = 'paliers';
    end if;
    if v_palier.prix::numeric / v_palier.quantite >= v_precedent then
      raise exception 'À % pièces, l''unité doit coûter moins qu''au palier d''avant', v_palier.quantite
        using errcode = 'check_violation', hint = 'paliers';
    end if;
    v_precedent := v_palier.prix::numeric / v_palier.quantite;
  end loop;

  delete from public.prix_quantite where boutique_id = p_boutique_id and produit_id = p_produit_id;
  insert into public.prix_quantite (boutique_id, produit_id, quantite, prix_millimes, updated_by)
  select p_boutique_id, p_produit_id, (x ->> 'quantite')::integer, (x ->> 'prix_millimes')::bigint, auth.uid()
    from jsonb_array_elements(p_paliers) x;
  return public.gestion_paliers(p_boutique_id, p_produit_id);
end;
$$;

revoke execute on function public.gestion_paliers(uuid, uuid)                      from public, anon;
revoke execute on function public.gestion_enregistrer_paliers(uuid, uuid, jsonb)   from public, anon;
grant  execute on function public.gestion_paliers(uuid, uuid)                      to authenticated;
grant  execute on function public.gestion_enregistrer_paliers(uuid, uuid, jsonb)   to authenticated;
