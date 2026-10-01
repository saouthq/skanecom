-- =====================================================================
-- SkanEcom — 66 · L'ÉDITEUR DE LA VITRINE : L'ACCUEIL DANS LE BROUILLON
-- =====================================================================
--
-- Tout ce qui se voit sur la vitrine se règle au même endroit, la vraie
-- vitrine à côté (feuille de route E). Premier pas : l'accueil entre dans
-- l'éditeur. Ses sections ne partent plus en ligne à l'enregistrement :
-- elles vivent dans le brouillon de l'apparence avec le style, et « Publier »
-- met le tout en ligne d'un coup.
--
-- 1. private.valide_sections : la validation des sections de l'accueil,
--    sortie de private.valide_theme (migration 59) pour servir aussi au
--    brouillon. valide_theme l'appelle ; rien ne change pour le thème.
-- 2. Le contenu d'un brouillon ou d'une publication peut porter `sections`
--    (absent : l'accueil publié reste ; NULL : celui de la structure ; une
--    liste : la composition). Même règles que le thème, une section au moins.
-- 3. gestion_apparence rend aussi l'accueil publié (`publie.sections`).
-- 4. gestion_publier_apparence publie aussi l'accueil. Elle rend, comme
--    gestion_enregistrer_accueil (migration 61), les photos que plus rien
--    n'emploie (`orphelins`) : celles de l'accueil publié et du brouillon
--    que le nouvel accueil n'a pas gardées. Abandonner le brouillon rend
--    de même celles qu'il était seul à employer. La route retire du dépôt
--    celles que le backoffice y avait mises — jamais tant qu'un brouillon
--    ou l'accueil publié les emploie (défaire un geste les retrouve).

-- ---------------------------------------------------------------------
-- 1. La validation des sections
-- ---------------------------------------------------------------------
create function private.valide_sections(p_boutique_id uuid, p_sections jsonb)
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
                                             'avis', 'questions', 'marques')
       or exists (select 1 from jsonb_object_keys(s) k
                   where k not in ('type', 'textes', 'image', 'nombre', 'lien', 'rayon', 'alignement', 'tri', 'page')) then
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
  end loop;
end;
$$;

revoke execute on function private.valide_sections(uuid, jsonb) from public, anon, authenticated;

create or replace function private.valide_theme()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Couleurs, polices, style
  perform private.valide_apparence(new.couleurs, new.polices, new.style);

  -- Fichiers
  perform private.valide_chemin(new.boutique_id, new.logo_chemin);
  perform private.valide_chemin(new.boutique_id, new.monogramme_chemin);
  perform private.valide_chemin(new.boutique_id, new.favicon_chemin);

  -- Textes de marque
  perform private.valide_textes(new.textes, 'themes.textes');

  -- Sections de l'accueil
  perform private.valide_sections(new.boutique_id, new.sections);

  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;


-- Les photos qu'emploie une liste de sections (et leur cadrage portrait).
create function private.photos_sections(p_sections jsonb)
returns setof text
language sql
immutable
set search_path = ''
as $$
  select distinct x.c
    from jsonb_array_elements(case when jsonb_typeof(p_sections) = 'array' then p_sections else '[]'::jsonb end) s,
         lateral (values (s -> 'image' ->> 'chemin'), (s -> 'image' ->> 'chemin_portrait')) x(c)
   where x.c is not null;
$$;

revoke execute on function private.photos_sections(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Le contenu d'un brouillon : l'apparence, et peut-être l'accueil
-- ---------------------------------------------------------------------
drop function private.valide_contenu_apparence(jsonb);

create function private.valide_contenu_apparence(p_boutique_id uuid, p_contenu jsonb)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_contenu) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_contenu) k where k not in ('code', 'couleurs', 'polices', 'style', 'sections'))
     or not (p_contenu ? 'code' and p_contenu ? 'couleurs' and p_contenu ? 'polices' and p_contenu ? 'style') then
    raise exception 'Apparence : {code, couleurs, polices, style, sections ?} attendu' using errcode = 'check_violation', hint = 'forme';
  end if;
  if (p_contenu ->> 'code') is null or (p_contenu ->> 'code') not in ('editorial', 'technique', 'bento') then
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

revoke execute on function private.valide_contenu_apparence(uuid, jsonb) from public, anon, authenticated;

create or replace function public.gestion_brouillon_apparence(p_boutique_id uuid, p_contenu jsonb, p_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant public.themes_brouillons;
  v_version integer;
  v_jeton uuid;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if not exists (select 1 from public.themes t where t.boutique_id = p_boutique_id) then
    raise exception 'La boutique n''a pas encore de thème : la console le pose à sa mise en place'
      using errcode = 'check_violation', hint = 'theme';
  end if;
  select * into v_avant from public.themes_brouillons b where b.boutique_id = p_boutique_id for update;
  if v_avant.version is distinct from p_version then
    raise exception 'Le brouillon a été modifié entre-temps : rechargez-le avant d''enregistrer'
      using errcode = 'check_violation', hint = 'version';
  end if;

  if p_contenu is null then
    delete from public.themes_brouillons b where b.boutique_id = p_boutique_id;
    -- Les photos que seul le brouillon employait.
    return jsonb_build_object('version', null, 'jeton', null, 'orphelins', coalesce((
      select jsonb_agg(c order by c)
        from private.photos_sections(v_avant.contenu -> 'sections') c
       where c not in (select private.photos_sections(t.sections) from public.themes t where t.boutique_id = p_boutique_id)), '[]'::jsonb));
  end if;

  perform private.valide_contenu_apparence(p_boutique_id, p_contenu);
  insert into public.themes_brouillons as b (boutique_id, contenu, updated_by)
  values (p_boutique_id, p_contenu, auth.uid())
  on conflict (boutique_id) do update
     set contenu = excluded.contenu, version = b.version + 1, updated_at = now(), updated_by = auth.uid()
  returning b.version, b.jeton into v_version, v_jeton;
  return jsonb_build_object('version', v_version, 'jeton', v_jeton);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Lire : l'accueil publié avec l'apparence
-- ---------------------------------------------------------------------
create or replace function public.gestion_apparence(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_theme public.themes;
  v_brouillon public.themes_brouillons;
begin
  perform private.catalogue_exige(p_boutique_id);
  select * into v_theme from public.themes t where t.boutique_id = p_boutique_id;
  select * into v_brouillon from public.themes_brouillons b where b.boutique_id = p_boutique_id;
  return jsonb_build_object(
    'theme', v_theme.boutique_id is not null,
    'version', v_theme.version,
    'publie', case when v_theme.boutique_id is null then null else jsonb_build_object(
      'code', v_theme.code, 'couleurs', v_theme.couleurs, 'polices', v_theme.polices, 'style', v_theme.style,
      'sections', v_theme.sections) end,
    'modifie_le', v_theme.updated_at,
    'modifie_par', (select u.email from auth.users u where u.id = v_theme.updated_by),
    'brouillon', case when v_brouillon.boutique_id is null then null else jsonb_build_object(
      'contenu', v_brouillon.contenu, 'version', v_brouillon.version, 'jeton', v_brouillon.jeton, 'modifie_le', v_brouillon.updated_at,
      'modifie_par', (select u.email from auth.users u where u.id = v_brouillon.updated_by)) end
  );
end;
$$;

comment on function public.gestion_apparence(uuid) is
  'L''apparence de la boutique pour son équipe : ce qui est publié (structure, couleurs, polices, style, sections de l''accueil — NULL : celles de la structure) et sa version, le brouillon en cours (sa version, qui et quand).';

comment on function public.gestion_brouillon_apparence(uuid, jsonb, integer) is
  'Enregistre le brouillon de l''apparence et de l''accueil (propriétaire, administrateur ; NULL l''abandonne et rend les photos que lui seul employait, orphelins). La version du brouillon lue est exigée (indice « version », NULL s''il n''y en avait pas), la forme est vérifiée (indices « forme », « vide »). Ne touche pas au thème publié.';

-- ---------------------------------------------------------------------
-- 4. Publier : l'apparence et l'accueil, d'un coup
-- ---------------------------------------------------------------------
create or replace function public.gestion_publier_apparence(p_boutique_id uuid, p_contenu jsonb, p_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant public.themes;
  v_apres public.themes;
  v_brouillon jsonb;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select * into v_avant from public.themes t where t.boutique_id = p_boutique_id for update;
  if not found then
    raise exception 'La boutique n''a pas encore de thème : la console le pose à sa mise en place'
      using errcode = 'check_violation', hint = 'theme';
  end if;
  if p_version is distinct from v_avant.version then
    raise exception 'L''apparence a été modifiée entre-temps : rechargez-la avant de publier'
      using errcode = 'check_violation', hint = 'version';
  end if;
  perform private.valide_contenu_apparence(p_boutique_id, p_contenu);

  select b.contenu into v_brouillon from public.themes_brouillons b where b.boutique_id = p_boutique_id;

  update public.themes t
     set code = p_contenu ->> 'code', couleurs = p_contenu -> 'couleurs', polices = p_contenu -> 'polices',
         style = p_contenu -> 'style',
         -- Sans `sections`, l'accueil publié reste tel quel.
         sections = case when p_contenu ? 'sections' then
                      case when jsonb_typeof(p_contenu -> 'sections') = 'array' then p_contenu -> 'sections' else null end
                    else t.sections end,
         updated_by = auth.uid()
   where t.boutique_id = p_boutique_id
  returning * into v_apres;
  delete from public.themes_brouillons b where b.boutique_id = p_boutique_id;

  perform private.console_trace(auth.uid(), p_boutique_id, 'apparence.publier', 'apparence',
    jsonb_build_object('code', v_avant.code, 'couleurs', v_avant.couleurs, 'polices', v_avant.polices, 'style', v_avant.style,
                       'sections', (select jsonb_agg(x ->> 'type') from jsonb_array_elements(coalesce(v_avant.sections, '[]'::jsonb)) x)),
    (p_contenu - 'sections') || jsonb_build_object('sections',
      (select jsonb_agg(x ->> 'type') from jsonb_array_elements(coalesce(v_apres.sections, '[]'::jsonb)) x)));
  -- Les photos que plus rien n'emploie : celles de l'accueil d'avant et du
  -- brouillon que le nouvel accueil n'a pas gardées.
  return jsonb_build_object('version', v_apres.version, 'orphelins', coalesce((
    select jsonb_agg(c order by c)
      from (select private.photos_sections(v_avant.sections) c
            union
            select private.photos_sections(v_brouillon -> 'sections')) a
     where c not in (select private.photos_sections(v_apres.sections))), '[]'::jsonb));
end;
$$;

comment on function public.gestion_publier_apparence(uuid, jsonb, integer) is
  'Publie l''apparence et, si le contenu en porte, l''accueil (propriétaire, administrateur) : structure, couleurs, polices, style et sections passent dans le thème, le brouillon s''efface. La version du thème lue est exigée (indice « version »), la forme est vérifiée (indices « forme », « vide »). Rend la nouvelle version et les photos que plus rien n''emploie (orphelins : de l''accueil d''avant ou du brouillon). Tracé au journal (apparence.publier).';
