-- =====================================================================
-- SkanEcom · migration 75 : LA SECTION « BANNIÈRES » (bannières défilantes)
-- =====================================================================
-- Une section de l'accueil, commune à toutes les structures : une à cinq
-- bannières qui défilent, chacune une photo (et son cadrage pour
-- téléphone), un titre, un texte, un bouton et le lien où il mène — une
-- collection, un rayon, une page de la boutique. Composée dans l'éditeur
-- de la vitrine (backoffice), comme les autres.
--
-- 1. private.valide_sections connaît le type « bannieres » et sa clé
--    « diapos » (une à cinq ; chacune : image, textes, lien — rien d'autre ;
--    le lien reste un chemin de la boutique, la photo dans son dossier).
-- 2. private.photos_sections compte les photos des diapos : publier ou
--    abandonner un brouillon ne retire plus du dépôt une photo de bannière
--    encore employée, et retire celle que plus rien n'emploie.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. La validation des sections : les bannières
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
  d jsonb;
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
                                             'avis', 'questions', 'marques', 'lookbook', 'piece', 'bannieres')
       or exists (select 1 from jsonb_object_keys(s) k
                   where k not in ('type', 'textes', 'image', 'nombre', 'lien', 'rayon', 'alignement', 'tri', 'page',
                                   'points', 'produit', 'diapos')) then
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
    -- Les bannières : une à cinq diapos, chacune sa photo (et son cadrage
    -- pour téléphone), ses textes, son lien — qui reste DANS la boutique.
    if s ? 'diapos' then
      if (s ->> 'type') <> 'bannieres' or jsonb_typeof(s -> 'diapos') <> 'array'
         or jsonb_array_length(s -> 'diapos') not between 1 and 5 then
        raise exception 'themes.sections : une à cinq diapos, sur des bannières seulement' using errcode = 'check_violation';
      end if;
      for d in select * from jsonb_array_elements(s -> 'diapos') loop
        if jsonb_typeof(d) <> 'object'
           or exists (select 1 from jsonb_object_keys(d) k where k not in ('image', 'textes', 'lien')) then
          raise exception 'themes.sections : diapo invalide %', d using errcode = 'check_violation';
        end if;
        if d ? 'textes' then
          perform private.valide_textes(d -> 'textes', 'themes.sections.bannieres');
        end if;
        if d ? 'image' then
          if jsonb_typeof(d -> 'image') <> 'object'
             or exists (select 1 from jsonb_object_keys(d -> 'image') k where k not in ('chemin', 'chemin_portrait'))
             or jsonb_typeof(d -> 'image' -> 'chemin') is distinct from 'string' then
            raise exception 'themes.sections : image de diapo invalide %', d -> 'image' using errcode = 'check_violation';
          end if;
          perform private.valide_chemin(p_boutique_id, d -> 'image' ->> 'chemin');
          perform private.valide_chemin(p_boutique_id, d -> 'image' ->> 'chemin_portrait');
        end if;
        if d ? 'lien' and (jsonb_typeof(d -> 'lien') <> 'string' or (d ->> 'lien') !~ '^/[A-Za-z0-9/_=~%.-]*$'
                           or (d ->> 'lien') like '//%' or (d ->> 'lien') like '%..%') then
          raise exception 'themes.sections : lien interne attendu (« /categorie/… »), pas %', d -> 'lien' using errcode = 'check_violation';
        end if;
      end loop;
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
-- 2. Les photos qu'emploie une liste de sections : celles des diapos aussi
-- ---------------------------------------------------------------------
create or replace function private.photos_sections(p_sections jsonb)
returns setof text
language sql
immutable
set search_path = ''
as $$
  with s as (
    select x from jsonb_array_elements(case when jsonb_typeof(p_sections) = 'array' then p_sections else '[]'::jsonb end) x
  )
  select distinct c.c
    from (
      select v.c from s, lateral (values (s.x -> 'image' ->> 'chemin'), (s.x -> 'image' ->> 'chemin_portrait')) v(c)
      union all
      select v.c
        from s,
             jsonb_array_elements(case when jsonb_typeof(s.x -> 'diapos') = 'array' then s.x -> 'diapos' else '[]'::jsonb end) d,
             lateral (values (d -> 'image' ->> 'chemin'), (d -> 'image' ->> 'chemin_portrait')) v(c)
    ) c
   where c.c is not null;
$$;

revoke execute on function private.photos_sections(jsonb) from public, anon, authenticated;
