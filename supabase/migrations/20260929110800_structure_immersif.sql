-- =====================================================================
-- SkanEcom — 69 · LA STRUCTURE IMMERSIVE, LE LOOKBOOK, LA PIÈCE DE LA SAISON
-- =====================================================================
--
-- Les structures de vitrine (feuille de route E) : l'IMMERSIF — la photo
-- plein écran, l'en-tête posé dessus, les collections et la sélection qui
-- glissent, le lookbook à points, la citation. Comme le Bento, il repose
-- sur les composants éditoriaux (fiches, catalogue, tunnel) ; `themes.code`
-- dit la structure (lib/theme.ts).
--
-- 1. themes.code accepte « immersif » ; la validation d'un brouillon ou
--    d'une publication d'apparence aussi.
-- 2. Deux sections de plus, communes à toutes les structures :
--    · « lookbook » : une photo (image), et sur elle six points au plus
--      ({x, y} en pour cent, `produit` : le slug d'un produit de la
--      boutique) — un point ouvre la fiche de la pièce portée. Un produit
--      retiré depuis : son point ne s'affiche plus (l'application le tait).
--    · « piece » : la pièce de la saison, un produit (`produit`) achetable
--      depuis l'accueil — une seule par accueil (sa barre d'achat est celle
--      de la page, au téléphone).
-- 3. gestion_accueil rend aussi les pièces publiées (`catalogue` : slug,
--    nom, première photo), pour que l'éditeur pose les points et choisisse
--    la pièce.

alter table public.themes drop constraint themes_code_check;
alter table public.themes add constraint themes_code_check check (code in ('editorial', 'technique', 'bento', 'immersif'));

comment on column public.themes.code is
  'La structure de la vitrine : editorial, technique, bento (la mosaïque), immersif (le plein écran), sur les composants éditoriaux pour les deux dernières.';

-- ---------------------------------------------------------------------
-- 1. La validation des sections : le lookbook, la pièce de la saison
-- ---------------------------------------------------------------------
create or replace function private.valide_sections(p_boutique_id uuid, p_sections jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s jsonb;
begin
  if p_sections is null then
    return;
  end if;
  if jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) > 12 then
    raise exception 'themes.sections : une liste de 12 sections au plus est attendue' using errcode = 'check_violation';
  end if;
  for s in select * from jsonb_array_elements(p_sections) loop
    if jsonb_typeof(s) <> 'object'
       or coalesce(s ->> 'type', '') not in ('hero', 'rayons', 'selection', 'editorial', 'engagements', 'texte',
                                             'avis', 'questions', 'marques', 'lookbook', 'piece')
       or exists (select 1 from jsonb_object_keys(s) k
                   where k not in ('type', 'textes', 'image', 'nombre', 'lien', 'rayon', 'alignement', 'tri', 'page',
                                   'points', 'produit')) then
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
      perform private.valide_chemin(p_boutique_id, s -> 'image' ->> 'chemin');
      -- Le cadrage portrait, pour les téléphones (facultatif).
      perform private.valide_chemin(p_boutique_id, s -> 'image' ->> 'chemin_portrait');
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
    -- Où poser le texte sur la photo d'ouverture : au début de la ligne
    -- (à gauche en français) ou à la fin, pour ne pas couvrir le sujet.
    if s ? 'alignement' and (s ->> 'type') <> 'hero' then
      raise exception 'themes.sections : l''alignement ne se règle que sur la section d''ouverture (hero)' using errcode = 'check_violation';
    end if;
    if s ? 'alignement' and (jsonb_typeof(s -> 'alignement') <> 'string' or (s ->> 'alignement') not in ('debut', 'fin')) then
      raise exception 'themes.sections : alignement « debut » ou « fin » attendu, pas %', s -> 'alignement' using errcode = 'check_violation';
    end if;
    -- L'ordre d'une sélection : celle de la boutique, ou les nouveautés.
    if s ? 'tri' and ((s ->> 'type') <> 'selection' or jsonb_typeof(s -> 'tri') <> 'string'
                      or (s ->> 'tri') not in ('selection', 'nouveautes')) then
      raise exception 'themes.sections : tri « selection » ou « nouveautes », sur une sélection seulement, pas %', s -> 'tri'
        using errcode = 'check_violation';
    end if;
    -- La page de questions d'où la section tire ses questions.
    if s ? 'page' and ((s ->> 'type') <> 'questions' or jsonb_typeof(s -> 'page') <> 'string'
                       or (s ->> 'page') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(s ->> 'page') > 60) then
      raise exception 'themes.sections : page de questions invalide %', s -> 'page' using errcode = 'check_violation';
    end if;
    -- Le lookbook : sur sa photo, six points au plus, chacun posé en pour cent
    -- de la largeur et de la hauteur, et menant à un produit (par son slug).
    if s ? 'points' then
      if (s ->> 'type') <> 'lookbook' or jsonb_typeof(s -> 'points') <> 'array' or jsonb_array_length(s -> 'points') > 6 then
        raise exception 'themes.sections : six points au plus, sur un lookbook seulement' using errcode = 'check_violation';
      end if;
      if exists (
        select 1 from jsonb_array_elements(s -> 'points') p
         where jsonb_typeof(p) <> 'object'
            or exists (select 1 from jsonb_object_keys(p) k where k not in ('x', 'y', 'produit'))
            or jsonb_typeof(p -> 'x') is distinct from 'number' or jsonb_typeof(p -> 'y') is distinct from 'number'
            or (p ->> 'x')::numeric not between 0 and 100 or (p ->> 'y')::numeric not between 0 and 100
            or jsonb_typeof(p -> 'produit') is distinct from 'string'
            or (p ->> 'produit') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p ->> 'produit') > 120
      ) then
        raise exception 'themes.sections : point de lookbook invalide (x, y entre 0 et 100, un produit)' using errcode = 'check_violation';
      end if;
    end if;
    -- La pièce de la saison : un produit, par son slug.
    if s ? 'produit' and ((s ->> 'type') <> 'piece' or jsonb_typeof(s -> 'produit') <> 'string'
                          or (s ->> 'produit') !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(s ->> 'produit') > 120) then
      raise exception 'themes.sections : produit invalide %, sur une pièce de la saison seulement', s -> 'produit'
        using errcode = 'check_violation';
    end if;
  end loop;
  -- Une seule pièce de la saison : sa barre d'achat est celle de la page.
  if (select count(*) from jsonb_array_elements(p_sections) x where x ->> 'type' = 'piece') > 1 then
    raise exception 'themes.sections : une seule pièce de la saison par accueil' using errcode = 'check_violation';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. Le contenu d'un brouillon ou d'une publication : la structure immersive
-- ---------------------------------------------------------------------
create or replace function private.valide_contenu_apparence(p_boutique_id uuid, p_contenu jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_contenu) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_contenu) k where k not in ('code', 'couleurs', 'polices', 'style', 'sections', 'reglages'))
     or not (p_contenu ? 'code' and p_contenu ? 'couleurs' and p_contenu ? 'polices' and p_contenu ? 'style') then
    raise exception 'Apparence : {code, couleurs, polices, style, sections ?, reglages ?} attendu' using errcode = 'check_violation', hint = 'forme';
  end if;
  if (p_contenu ->> 'code') is null or (p_contenu ->> 'code') not in ('editorial', 'technique', 'bento', 'immersif') then
    raise exception 'Apparence : structure inconnue %', p_contenu -> 'code' using errcode = 'check_violation', hint = 'forme';
  end if;
  -- Une liste vide ne laisserait qu'un en-tête et un pied de page.
  if jsonb_typeof(p_contenu -> 'sections') = 'array' and jsonb_array_length(p_contenu -> 'sections') = 0 then
    raise exception 'L''accueil garde une section au moins' using errcode = 'check_violation', hint = 'vide';
  end if;
  begin
    perform private.valide_apparence(p_contenu -> 'couleurs', p_contenu -> 'polices', p_contenu -> 'style');
    if jsonb_typeof(p_contenu -> 'sections') = 'array' then
      perform private.valide_sections(p_boutique_id, p_contenu -> 'sections');
    end if;
  exception when check_violation then
    raise exception '%', sqlerrm using errcode = 'check_violation', hint = 'forme';
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. L'éditeur : les pièces publiées, à pointer ou à choisir
-- ---------------------------------------------------------------------
create or replace function public.gestion_accueil(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_theme public.themes;
begin
  perform private.catalogue_exige(p_boutique_id);
  select * into v_theme from public.themes t where t.boutique_id = p_boutique_id;
  return jsonb_build_object(
    'code',     coalesce(v_theme.code, 'editorial'),
    'theme',    v_theme.boutique_id is not null,
    'version',  v_theme.version,
    'sections', v_theme.sections,
    'modifie_le',  v_theme.updated_at,
    'modifie_par', (select u.email from auth.users u where u.id = v_theme.updated_by),
    'rayons', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', c.slug, 'nom', coalesce(c.nom_fr, c.nom_ar),
               'parent', (select pc.slug from public.categories pc where pc.boutique_id = c.boutique_id and pc.id = c.parent_id),
               'produits', (select count(*) from public.produits p
                             where p.boutique_id = c.boutique_id and p.publie
                               and (p.categorie_id = c.id
                                    or p.categorie_id in (select e.id from public.categories e where e.boutique_id = c.boutique_id and e.parent_id = c.id))))
             order by c.parent_id nulls first, c.position, c.slug)
        from public.categories c where c.boutique_id = p_boutique_id and c.actif), '[]'::jsonb),
    'pages', coalesce((
      select jsonb_agg(jsonb_build_object('slug', p.slug, 'titre', p.titre_fr, 'publie', p.publie) order by p.position, p.slug)
        from public.pages_boutique p where p.boutique_id = p_boutique_id and p.genre = 'questions'), '[]'::jsonb),
    'avis', jsonb_build_object(
      'actif', private.avis_actif(p_boutique_id),
      'montrables', (select count(*) from public.avis a
                      join public.produits p on p.boutique_id = a.boutique_id and p.id = a.produit_id
                      where a.boutique_id = p_boutique_id and a.statut = 'publie' and a.note >= 4 and a.texte is not null and p.publie)),
    'marques', (select count(distinct lower(btrim(p.marque))) from public.produits p
                 where p.boutique_id = p_boutique_id and p.publie and nullif(btrim(p.marque), '') is not null),
    'produits', (select count(*) from public.produits p where p.boutique_id = p_boutique_id and p.publie),
    -- Les pièces publiées, pour poser les points du lookbook et choisir la
    -- pièce de la saison : les mises en avant d'abord, 300 au plus.
    'catalogue', coalesce((
      select jsonb_agg(jsonb_build_object('slug', x.slug, 'nom', x.nom, 'image', x.image) order by x.rang)
        from (select p.slug, coalesce(p.nom_fr, p.nom_ar) as nom,
                     (select i.chemin from public.produit_images i
                       where i.boutique_id = p.boutique_id and i.produit_id = p.id
                       order by i.position, i.created_at limit 1) as image,
                     row_number() over (order by p.mis_en_avant desc, p.position, coalesce(p.nom_fr, p.nom_ar), p.slug) as rang
                from public.produits p
               where p.boutique_id = p_boutique_id and p.publie
               order by rang
               limit 300) x), '[]'::jsonb)
  );
end;
$$;
