-- =====================================================================
-- SkanEcom — 05 · VITRINE
-- Thème de chaque boutique · fichiers rangés par boutique · cadre public ·
-- catalogue filtré, trié et paginé EN BASE
-- 29/09/2026 — étape 1, tâche « application » (docs/SUITE-DEV.md) ;
-- piège 11 de docs/cadrage/03-reprise-maymar.md corrigé
-- =====================================================================


-- ---------------------------------------------------------------------
-- Fichiers (photos, logo…) : rangés sous le dossier de leur boutique
-- ---------------------------------------------------------------------
-- Les fichiers vivent sur R2, sous `<slug de la boutique>/…`. Une boutique ne
-- référence jamais le fichier d'une autre, et un chemin ne peut pas sortir de
-- son dossier (`..`) ni viser une autre adresse.
create function private.valide_chemin(p_boutique_id uuid, p_chemin text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_slug text;
begin
  if p_chemin is null then
    return;
  end if;
  select b.slug into v_slug from plateforme.boutiques b where b.id = p_boutique_id;
  if p_chemin !~ '^[a-z0-9][a-z0-9/_.-]*$' or p_chemin like '%..%' or length(p_chemin) > 200
     or p_chemin not like v_slug || '/%' then
    raise exception 'Chemin de fichier invalide : % (attendu : %/…, lettres minuscules, chiffres, / _ . -)', p_chemin, v_slug
      using errcode = 'check_violation';
  end if;
end;
$$;

create function private.valide_chemins_catalogue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  case tg_table_name
    when 'produit_images' then perform private.valide_chemin(new.boutique_id, new.chemin);
    else perform private.valide_chemin(new.boutique_id, new.image_chemin);
  end case;
  return new;
end;
$$;

create trigger produit_images_valide_chemin before insert or update of chemin on public.produit_images
  for each row execute function private.valide_chemins_catalogue();
create trigger categories_valide_chemin before insert or update of image_chemin on public.categories
  for each row execute function private.valide_chemins_catalogue();
create trigger variantes_valide_chemin before insert or update of image_chemin on public.variantes
  for each row execute function private.valide_chemins_catalogue();

revoke execute on function private.valide_chemin(uuid, text)      from public, anon, authenticated;
revoke execute on function private.valide_chemins_catalogue()     from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- Thème de chaque boutique
-- ---------------------------------------------------------------------
-- Le code est le même pour toutes les boutiques ; le thème l'habille. Son
-- `code` est le GABARIT, c'est-à-dire la structure des pages :
--   · editorial — mode, bagages, maroquinerie : grandes images, peu de mots ;
--   · technique — outillage, quincaillerie : grille dense, fiches techniques.
-- La boutique règle par-dessus ses couleurs, ses polices, ses textes et ses
-- sections d'accueil.
--
-- SÉCURITÉ : les couleurs et les polices finissent dans une balise <style>
-- de chaque page. Une valeur libre permettrait d'y injecter du CSS, voire de
-- fermer la balise. D'où des listes fermées, vérifiées ici par la base :
--   couleurs : 13 jetons connus, valeurs #RRGGBB uniquement ;
--   polices  : familles embarquées par l'application ;
--   sections : types connus, textes limités, images dans le dossier de la
--              boutique.
create table public.themes (
  boutique_id       uuid primary key references plateforme.boutiques (id) on delete cascade,
  code              text not null default 'editorial'
                    check (code in ('editorial', 'technique')),
  couleurs          jsonb not null default '{}'::jsonb,
  polices           jsonb not null default '{}'::jsonb,
  logo_chemin       text,
  -- « masque » : logo monochrome qui prend la couleur du texte (clair sur le
  -- pied de page foncé) ; « image » : logo affiché avec ses propres couleurs.
  logo_mode         text not null default 'masque' check (logo_mode in ('masque', 'image')),
  logo_ratio        numeric(6, 3) not null default 5 check (logo_ratio between 0.2 and 20),
  monogramme_chemin text,
  favicon_chemin    text,
  textes            jsonb not null default '{}'::jsonb,
  sections          jsonb,
  version           integer not null default 1,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id) on delete set null
);

comment on column public.themes.couleurs is
  'Jetons de couleur qui remplacent ceux du thème : fond, surface, surface_2, filet, filet_fort, contour_champ, encre, encre_doux, accent, accent_clair, succes, erreur, alerte. Valeurs #RRGGBB.';
comment on column public.themes.textes is
  'Textes de marque, par langue : {"resume_fr": "…", "resume_ar": "…"}.';
comment on column public.themes.sections is
  'Sections de l''accueil, dans l''ordre : [{"type": "hero", "textes": {...}, "image": {"chemin": "...", "chemin_portrait": "...", "detouree": true}}, …]. NULL = les sections par défaut du thème.';

create function private.valide_textes(p_textes jsonb, p_ou text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  e record;
begin
  if jsonb_typeof(p_textes) <> 'object' then
    raise exception '% : un objet {"cle_fr": "texte"} est attendu', p_ou using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_each(p_textes) loop
    if e.key !~ '^[a-z][a-z0-9_]*_(fr|ar)$' or jsonb_typeof(e.value) <> 'string' or length(e.value #>> '{}') > 600 then
      raise exception '% : texte invalide « % » (clé en _fr ou _ar, texte de 600 caractères au plus)', p_ou, e.key
        using errcode = 'check_violation';
    end if;
  end loop;
end;
$$;

create function private.valide_theme()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  s jsonb;
begin
  -- Couleurs
  if jsonb_typeof(new.couleurs) <> 'object' then
    raise exception 'themes.couleurs : un objet est attendu' using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_each(new.couleurs) loop
    if e.key not in ('fond', 'surface', 'surface_2', 'filet', 'filet_fort', 'contour_champ',
                     'encre', 'encre_doux', 'accent', 'accent_clair', 'succes', 'erreur', 'alerte') then
      raise exception 'themes.couleurs : jeton inconnu « % »', e.key using errcode = 'check_violation';
    end if;
    if jsonb_typeof(e.value) <> 'string' or (e.value #>> '{}') !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'themes.couleurs : « % » doit valoir #RRGGBB', e.key using errcode = 'check_violation';
    end if;
  end loop;

  -- Polices
  if jsonb_typeof(new.polices) <> 'object' then
    raise exception 'themes.polices : un objet est attendu' using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_each(new.polices) loop
    if not ((e.key = 'titres' and e.value in ('"instrument-serif"', '"instrument-sans"', '"archivo"', '"young-serif"', '"plex-sans"'))
            or (e.key = 'texte' and e.value in ('"instrument-sans"', '"archivo"', '"plex-sans"'))) then
      raise exception 'themes.polices : « % » = % n''est pas une police disponible', e.key, e.value
        using errcode = 'check_violation';
    end if;
  end loop;

  -- Fichiers
  perform private.valide_chemin(new.boutique_id, new.logo_chemin);
  perform private.valide_chemin(new.boutique_id, new.monogramme_chemin);
  perform private.valide_chemin(new.boutique_id, new.favicon_chemin);

  -- Textes de marque
  perform private.valide_textes(new.textes, 'themes.textes');

  -- Sections de l'accueil
  if new.sections is not null then
    if jsonb_typeof(new.sections) <> 'array' or jsonb_array_length(new.sections) > 12 then
      raise exception 'themes.sections : une liste de 12 sections au plus est attendue' using errcode = 'check_violation';
    end if;
    for s in select * from jsonb_array_elements(new.sections) loop
      if jsonb_typeof(s) <> 'object'
         or coalesce(s ->> 'type', '') not in ('hero', 'rayons', 'selection', 'editorial', 'engagements', 'texte')
         or exists (select 1 from jsonb_object_keys(s) k where k not in ('type', 'textes', 'image', 'nombre', 'lien', 'rayon')) then
        raise exception 'themes.sections : section invalide %', s using errcode = 'check_violation';
      end if;
      if s ? 'textes' then
        perform private.valide_textes(s -> 'textes', 'themes.sections.' || (s ->> 'type'));
      end if;
      if s ? 'image' then
        if jsonb_typeof(s -> 'image') <> 'object'
           or exists (select 1 from jsonb_object_keys(s -> 'image') k where k not in ('chemin', 'chemin_portrait', 'detouree'))
           or (s -> 'image' ? 'detouree' and jsonb_typeof(s -> 'image' -> 'detouree') <> 'boolean') then
          raise exception 'themes.sections : image invalide %', s -> 'image' using errcode = 'check_violation';
        end if;
        perform private.valide_chemin(new.boutique_id, s -> 'image' ->> 'chemin');
        -- Le cadrage portrait, pour les téléphones (facultatif).
        perform private.valide_chemin(new.boutique_id, s -> 'image' ->> 'chemin_portrait');
      end if;
      if s ? 'nombre' and (jsonb_typeof(s -> 'nombre') <> 'number' or (s ->> 'nombre')::numeric not between 1 and 24) then
        raise exception 'themes.sections : nombre entre 1 et 24' using errcode = 'check_violation';
      end if;
      -- Un lien reste DANS la boutique : un chemin, jamais une autre origine.
      if s ? 'lien' and (jsonb_typeof(s -> 'lien') <> 'string' or (s ->> 'lien') !~ '^/[A-Za-z0-9/_=~%.-]*$'
                         or (s ->> 'lien') like '//%' or (s ->> 'lien') like '%..%') then
        raise exception 'themes.sections : lien interne attendu (« /categorie/… »), pas %', s -> 'lien' using errcode = 'check_violation';
      end if;
      if s ? 'rayon' and (jsonb_typeof(s -> 'rayon') <> 'string' or (s ->> 'rayon') !~ '^[a-z0-9]+(-[a-z0-9]+)*$') then
        raise exception 'themes.sections : identifiant de rayon invalide %', s -> 'rayon' using errcode = 'check_violation';
      end if;
    end loop;
  end if;

  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create trigger themes_valide
  before insert or update on public.themes
  for each row execute function private.valide_theme();
create trigger themes_boutique_immuable
  before update of boutique_id on public.themes
  for each row execute function private.boutique_immuable();

revoke execute on function private.valide_textes(jsonb, text) from public, anon, authenticated;
revoke execute on function private.valide_theme()             from public, anon, authenticated;

alter table public.themes enable row level security;

create policy "themes: lecture publique des boutiques actives"
  on public.themes for select
  using (boutique_id in (select private.boutiques_visibles()));
create policy "themes: l'équipe lit le sien"
  on public.themes for select
  using (boutique_id in (select private.mes_boutiques()));
create policy "themes: la gestion crée"
  on public.themes for insert
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));
create policy "themes: la gestion modifie"
  on public.themes for update
  using (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')))
  with check (boutique_id in (select private.mes_boutiques('{proprietaire,admin}')));


-- ---------------------------------------------------------------------
-- Produits tels que la vitrine les affiche
-- ---------------------------------------------------------------------
-- security_invoker : la vue lit les tables avec les droits de celui qui
-- l'interroge, donc sous leur RLS. Seuls les produits publiés, leurs
-- variantes actives et les rayons actifs y figurent, même pour l'équipe.
create view public.vitrine_produits
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
                     'poids_grammes', v.poids_grammes, 'image_chemin', v.image_chemin)
                   order by v.position, v.sku)
              from public.variantes v
             where v.boutique_id = p.boutique_id and v.produit_id = p.id and v.actif), '[]'::jsonb) as variantes,
  coalesce((select jsonb_agg(jsonb_build_object('chemin', i.chemin, 'variante_id', i.variante_id,
                                                'alt_fr', i.alt_fr, 'alt_ar', i.alt_ar)
                             order by i.position, i.chemin)
              from public.produit_images i
             where i.boutique_id = p.boutique_id and i.produit_id = p.id), '[]'::jsonb) as images
from public.produits p
where p.publie;

comment on view public.vitrine_produits is
  'Un produit publié avec son rayon, ses axes, ses variantes actives et ses photos, en une ligne. Lue par la fiche produit (filtrer par boutique_id ET slug) et par public.liste_produits.';


-- ---------------------------------------------------------------------
-- Le cadre d'une boutique : tout ce que chaque page doit savoir, en un appel
-- ---------------------------------------------------------------------
create function public.boutique_publique(p_slug text)
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
      from public.zones_livraison z where z.boutique_id = b.id and z.actif), '[]'::jsonb)
  )
  from plateforme.boutiques b
  where b.slug = p_slug and b.statut = 'active';
$$;

comment on function public.boutique_publique(text) is
  'Le cadre d''une boutique active pour la vitrine : identité, réglages publics, modules, thème, rayons actifs, zones. Un seul appel par page. NULL si la boutique n''est pas active.';


-- ---------------------------------------------------------------------
-- Le catalogue filtré, trié et paginé en base
-- ---------------------------------------------------------------------
-- Remplace le chargement de tout le catalogue en mémoire de Maymar, prévu
-- pour « des centaines de références » : la quincaillerie en aura des
-- milliers.
--
-- p_filtres = {
--   "rayon":    "slug",                        rayon ET ses sous-rayons
--   "options":  {"couleur": ["Noir", "Gris"]}, n'importe quel axe de variante
--   "en_stock": true,
--   "prix_min": 100000, "prix_max": 300000,    millimes
--   "q":        "dcd796"                       nom, marque, description, SKU ;
--                                              tolère les fautes sur le nom
-- }
-- p_tri : nouveautes · selection (mis en avant d'abord) · prix-asc ·
--         prix-desc · nom · pertinence (recherche)
--
-- RÈGLE REPRISE DE MAYMAR : un produit passe si AU MOINS UNE de ses variantes
-- satisfait TOUS les critères de variante à la fois. Sinon on afficherait un
-- « rouge en 55 cm » qui n'existe qu'en rouge 75 et en noir 55.
-- Chaque facette compte les produits que l'option laisserait passer, les
-- AUTRES filtres restant en place ; les options à 0 sont renvoyées aussi,
-- pour être affichées éteintes.
--
-- SECURITY INVOKER : la RLS s'applique. Un visiteur ne voit que les produits
-- publiés des boutiques actives, quoi qu'il passe en paramètre.
create function public.liste_produits(
  p_boutique_id uuid,
  p_filtres     jsonb   default '{}'::jsonb,
  p_tri         text    default 'nouveautes',
  p_page        integer default 1,
  p_par_page    integer default 24
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_options  jsonb   := coalesce(p_filtres -> 'options', '{}'::jsonb);
  v_en_stock boolean := coalesce((p_filtres ->> 'en_stock')::boolean, false);
  v_min      bigint  := (p_filtres ->> 'prix_min')::bigint;
  v_max      bigint  := (p_filtres ->> 'prix_max')::bigint;
  v_rayon    text    := nullif(btrim(p_filtres ->> 'rayon'), '');
  v_q        text    := nullif(left(btrim(coalesce(p_filtres ->> 'q', '')), 80), '');
  v_tri      text    := case when p_tri in ('nouveautes', 'selection', 'prix-asc', 'prix-desc', 'nom', 'pertinence')
                             then p_tri else 'nouveautes' end;
  v_par_page integer := least(greatest(coalesce(p_par_page, 24), 1), 100);
  v_page     integer := greatest(coalesce(p_page, 1), 1);
  v_motif    text;
  v_resultat jsonb;
begin
  if jsonb_typeof(v_options) <> 'object' then
    raise exception 'filtres.options : un objet {"axe": ["valeur", …]} est attendu'
      using errcode = 'invalid_parameter_value';
  end if;
  -- Une valeur seule vaut une liste d'une valeur.
  select coalesce(jsonb_object_agg(e.key, case jsonb_typeof(e.value) when 'array' then e.value
                                                                      else jsonb_build_array(e.value) end), '{}'::jsonb)
    into v_options
    from jsonb_each(v_options) e;
  -- Les jokers de LIKE saisis par le visiteur sont pris au pied de la lettre.
  v_motif := case when v_q is null then null
                  else '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%' end;

  with recursive
  rayon as (
    select c.id from public.categories c
     where c.boutique_id = p_boutique_id and c.slug = v_rayon and c.actif
    union
    select c.id from public.categories c join rayon r on c.parent_id = r.id
     where c.boutique_id = p_boutique_id and c.actif
  ),
  produits_q as (
    select p.id, p.categorie_id, p.created_at, p.position, p.mis_en_avant,
           lower(coalesce(p.nom_fr, p.nom_ar)) as nom,
           case when v_q is null then 0::real
                else greatest(
                       extensions.similarity(coalesce(p.nom_fr, '') || ' ' || coalesce(p.nom_ar, ''), v_q),
                       case when exists (select 1 from public.variantes v
                                          where v.boutique_id = p.boutique_id and v.produit_id = p.id
                                            and v.actif and v.sku ilike v_motif) then 1 else 0 end)
           end as pertinence
      from public.produits p
     where p.boutique_id = p_boutique_id and p.publie
       and (v_q is null
            or (coalesce(p.nom_fr, '') || ' ' || coalesce(p.nom_ar, '')) ilike v_motif
            or (coalesce(p.nom_fr, '') || ' ' || coalesce(p.nom_ar, '')) operator(extensions.%) v_q
            or to_tsvector('french', coalesce(p.nom_fr, '') || ' ' || coalesce(p.marque, '') || ' ' || coalesce(p.description_fr, ''))
               @@ websearch_to_tsquery('french', v_q)
            or exists (select 1 from public.variantes v
                        where v.boutique_id = p.boutique_id and v.produit_id = p.id
                          and v.actif and v.sku ilike v_motif))
  ),
  dans_rayon as (
    select * from produits_q where v_rayon is null or categorie_id in (select id from rayon)
  ),
  variantes_q as (
    select v.produit_id, v.options, v.prix_millimes, v.position,
           (not v_en_stock or v.stock > 0)
           and (v_min is null or v.prix_millimes >= v_min)
           and (v_max is null or v.prix_millimes <= v_max) as ok_base
      from public.variantes v
     where v.boutique_id = p_boutique_id and v.actif
       and v.produit_id in (select id from produits_q)
  ),
  -- Produits retenus par les critères de variante, rayon non compris (il
  -- sert à la facette des rayons).
  retenus_tous as (
    select distinct vq.produit_id
      from variantes_q vq
     where vq.ok_base
       and not exists (select 1 from jsonb_each(v_options) f
                        where not coalesce(f.value ? (vq.options ->> f.key), false))
  ),
  retenus as (
    select d.* from dans_rayon d where d.id in (select produit_id from retenus_tous)
  ),
  ordonnes as (
    select r.id,
           row_number() over (order by
             case when v_tri = 'selection'  then r.mis_en_avant end desc nulls last,
             case when v_tri = 'prix-asc'   then pp.prix end asc  nulls last,
             case when v_tri = 'prix-desc'  then pp.prix end desc nulls last,
             case when v_tri = 'nom'        then r.nom end asc,
             case when v_tri = 'pertinence' then r.pertinence end desc,
             case when v_tri in ('nouveautes', 'selection', 'pertinence') then r.created_at end desc,
             r.position, r.id) as n
      from retenus r
      left join (select produit_id, min(prix_millimes) as prix from variantes_q group by produit_id) pp
        on pp.produit_id = r.id
  ),
  page as (
    select id, n from ordonnes
     where n > (v_page - 1) * v_par_page and n <= v_page * v_par_page
  ),
  valeurs as (
    select o.key as cle, o.value as valeur, min(vq.position) as rang
      from variantes_q vq
      join dans_rayon d on d.id = vq.produit_id
     cross join lateral jsonb_each_text(vq.options) o
     group by o.key, o.value
  ),
  comptes as (
    select o.key as cle, o.value as valeur, count(distinct vq.produit_id) as compte
      from variantes_q vq
      join dans_rayon d on d.id = vq.produit_id
     cross join lateral jsonb_each_text(vq.options) o
     where vq.ok_base
       and not exists (select 1 from jsonb_each(v_options) f
                        where f.key <> o.key and not coalesce(f.value ? (vq.options ->> f.key), false))
     group by o.key, o.value
  ),
  facette_rayons as (
    select c.slug, c.nom_fr, c.nom_ar, min(c.position) as position, count(*) as compte
      from produits_q p
      join retenus_tous rt on rt.produit_id = p.id
      join public.categories c on c.boutique_id = p_boutique_id and c.id = p.categorie_id and c.actif
     group by c.slug, c.nom_fr, c.nom_ar
  )
  select jsonb_build_object(
    'total', (select count(*) from retenus),
    'page', v_page,
    'par_page', v_par_page,
    'produits', coalesce((
      select jsonb_agg(to_jsonb(vp) - 'boutique_id' order by pg.n)
        from page pg
        join public.vitrine_produits vp on vp.boutique_id = p_boutique_id and vp.id = pg.id), '[]'::jsonb),
    'facettes', jsonb_build_object(
      -- Les axes présents dans le rayon, avec leur libellé, dans l'ordre voulu
      -- par le backoffice (position des axes sur les fiches).
      'axes', coalesce((
        select jsonb_agg(jsonb_build_object('cle', a.cle, 'label_fr', a.label_fr, 'label_ar', a.label_ar)
                         order by a.position, a.cle)
          from (select o.cle, min(o.label_fr) as label_fr, min(o.label_ar) as label_ar, min(o.position) as position
                  from public.produit_options o
                 where o.boutique_id = p_boutique_id and o.produit_id in (select id from dans_rayon)
                 group by o.cle) a), '[]'::jsonb),
      'options', coalesce((
        select jsonb_object_agg(x.cle, x.valeurs)
          from (select v.cle,
                       jsonb_agg(jsonb_build_object('valeur', v.valeur, 'compte', coalesce(c.compte, 0))
                                 order by v.rang, v.valeur) as valeurs
                  from valeurs v left join comptes c using (cle, valeur)
                 group by v.cle) x), '{}'::jsonb),
      'rayons', coalesce((
        select jsonb_agg(jsonb_build_object('slug', slug, 'nom_fr', nom_fr, 'nom_ar', nom_ar, 'compte', compte)
                         order by position, slug)
          from facette_rayons), '[]'::jsonb),
      'prix', (select case when count(*) = 0 then null
                           else jsonb_build_object('min', min(vq.prix_millimes), 'max', max(vq.prix_millimes)) end
                 from variantes_q vq where vq.produit_id in (select id from dans_rayon))
    )
  ) into v_resultat;

  return v_resultat;
end;
$$;

comment on function public.liste_produits(uuid, jsonb, text, integer, integer) is
  'Catalogue public d''une boutique : filtres sur n''importe quel axe de variante, rayon et sous-rayons, stock, prix, recherche (nom, marque, description, SKU, fautes de frappe) ; tri, pagination, facettes. Sous la RLS de l''appelant.';


-- ---------------------------------------------------------------------
-- L'annuaire des domaines, pour l'instantané embarqué dans la vitrine
-- ---------------------------------------------------------------------
-- La vitrine résout le domaine de chaque requête. Si elle devait demander à
-- la base à chaque fois, une panne de la base rendrait TOUTES les boutiques
-- injoignables, même leurs pages en cache. Elle embarque donc un instantané
-- de l'annuaire, figé au déploiement par outils/annuaire.mjs, et n'interroge
-- la base (public.resoudre_domaine) que pour un domaine qu'elle ne connaît
-- pas encore.
-- Réservée à la clé de service : la liste complète des domaines est la liste
-- de nos clients.
create function public.annuaire_domaines()
returns table (hote text, slug text)
language sql
stable
security definer
set search_path = ''
as $$
  select d.hote, b.slug
  from plateforme.domaines d
  join plateforme.boutiques b on b.id = d.boutique_id
  where b.statut = 'active'
  order by d.hote;
$$;

revoke execute on function public.annuaire_domaines() from public, anon, authenticated;
grant  execute on function public.annuaire_domaines() to service_role;
