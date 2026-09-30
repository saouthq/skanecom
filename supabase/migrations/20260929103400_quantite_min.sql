-- =====================================================================
-- SkanEcom — 35 · LA QUANTITÉ MINIMALE D'UNE DÉCLINAISON
-- 30/09/2026 — PRD §6.2 B1 (le catalogue) : « la quincaillerie vend les
-- vis par boîte de cent, les chevilles par lot de dix »
-- =====================================================================
--
-- Chaque déclinaison porte une quantité minimale de commande (1 par défaut :
-- rien ne change pour une valise). Au-dessus, le panier n'accepte pas moins :
--   · la vitrine la lit (public.vitrine_produits, donc aussi
--     public.liste_produits) pour démarrer le sélecteur à ce nombre ;
--   · le devis la rend par ligne et ne se dit « complet » que si chaque
--     ligne l'atteint — passer_commande refuse donc une commande en deçà
--     (indice « stock », comme une quantité qu'on ne peut pas servir) ;
--   · le backoffice la règle depuis la fiche produit, avec le prix et le
--     seuil (gestion_enregistrer_variante, un paramètre de plus, facultatif :
--     les appels existants gardent la valeur en place).
-- Un minimum n'est pas un pas : 12 vis se commandent aussi par 13. Il va
-- jusqu'à 999, la plus grande quantité d'une ligne de panier (migration 08).

alter table public.variantes
  add column quantite_min integer not null default 1
  constraint variantes_quantite_min check (quantite_min between 1 and 999);

comment on column public.variantes.quantite_min is
  'Quantité minimale d''une ligne de commande pour cette déclinaison (1 = aucune contrainte). Vérifiée par le devis (private.chiffre_commande).';


-- ---------------------------------------------------------------------
-- La vitrine : la déclinaison dit son minimum (migration 27, reprise)
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
             where a.boutique_id = p.boutique_id and p.caracteristiques ? a.cle), '[]'::jsonb) as caracteristiques
from public.produits p
where p.publie;

comment on view public.vitrine_produits is
  'Un produit publié avec son rayon, ses axes, ses variantes actives (minimum de commande compris), ses photos et sa fiche technique, en une ligne. Lue par la fiche produit (filtrer par boutique_id ET slug) et par public.liste_produits.';


-- ---------------------------------------------------------------------
-- Le devis : une ligne sous le minimum n'est pas « complète »
-- (migration 29, reprise ; ce qui change : quantite_min lue, rendue par
-- ligne, et exigée par « complet »)
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
      'total_ligne_millimes',   case when l.vendable then l.prix_millimes * l.quantite end
    ) order by l.produit_nom nulls last, l.sku, l.variante_id),
    coalesce(sum(case when l.vendable then l.prix_millimes * l.quantite end), 0),
    bool_and(l.vendable and l.stock >= l.quantite and l.quantite >= l.quantite_min),
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
-- Le backoffice : la fiche lit le minimum… (migration 11, reprise)
-- ---------------------------------------------------------------------
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
                             'minimum', v.quantite_min)
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


-- ---------------------------------------------------------------------
-- … et l'enregistre (migration 11, reprise ; un paramètre de plus,
-- facultatif : null laisse le minimum en place)
-- ---------------------------------------------------------------------
drop function public.gestion_enregistrer_variante(uuid, uuid, bigint, bigint, integer, boolean);

create function public.gestion_enregistrer_variante(
  p_boutique_id  uuid,
  p_variante_id  uuid,
  p_prix         bigint,
  p_prix_barre   bigint,
  p_seuil        integer,
  p_actif        boolean,
  p_quantite_min integer default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_produit uuid;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if p_prix is null or p_prix <= 0 then
    raise exception 'Le prix doit être supérieur à zéro' using errcode = 'check_violation', hint = 'prix';
  end if;
  if p_prix_barre is not null and p_prix_barre <= p_prix then
    raise exception 'Le prix barré doit être supérieur au prix' using errcode = 'check_violation', hint = 'prix_barre';
  end if;
  if p_seuil is null or p_seuil < 0 or p_seuil > 10000 then
    raise exception 'Seuil d''alerte invalide' using errcode = 'check_violation', hint = 'seuil';
  end if;
  if p_quantite_min is not null and (p_quantite_min < 1 or p_quantite_min > 999) then
    raise exception 'La quantité minimale va de 1 à 999' using errcode = 'check_violation', hint = 'minimum';
  end if;

  select v.produit_id into v_produit from public.variantes v
   where v.boutique_id = p_boutique_id and v.id = p_variante_id for update;
  if v_produit is null then
    raise exception 'Déclinaison introuvable' using errcode = 'no_data_found', hint = 'variante';
  end if;
  -- Un produit publié garde au moins une déclinaison en vente.
  if not coalesce(p_actif, true)
     and exists (select 1 from public.produits p where p.boutique_id = p_boutique_id and p.id = v_produit and p.publie)
     and not exists (select 1 from public.variantes v where v.boutique_id = p_boutique_id and v.produit_id = v_produit
                     and v.actif and v.id <> p_variante_id) then
    raise exception 'C''est la dernière déclinaison en vente : retirez d''abord le produit de la vitrine'
      using errcode = 'check_violation', hint = 'dernier';
  end if;

  update public.variantes set
    prix_millimes = p_prix, prix_barre_millimes = p_prix_barre, seuil_alerte_stock = p_seuil, actif = coalesce(p_actif, true),
    quantite_min = coalesce(p_quantite_min, quantite_min)
  where boutique_id = p_boutique_id and id = p_variante_id;
  perform private.rafraichit_prix_min(p_boutique_id, v_produit);
end;
$$;

revoke execute on function public.gestion_enregistrer_variante(uuid, uuid, bigint, bigint, integer, boolean, integer) from public, anon;
grant  execute on function public.gestion_enregistrer_variante(uuid, uuid, bigint, bigint, integer, boolean, integer) to authenticated;
