-- =====================================================================
-- SkanEcom — 20 · CONSOLE : LE LOGO ET LES IMAGES DE LA MARQUE
-- Logo, monogramme, icône d'onglet, photo d'ouverture (ses deux cadrages)
-- et photo du récit, téléversés depuis la console (C2) au lieu d'être
-- déposés à la main
-- 29/09/2026 — étape 1, tâche « console » (docs/SUITE-DEV.md)
-- =====================================================================
--
-- Le fichier est déposé par la console sous `<boutique>/marque/` (R2 en
-- production), puis inscrit ici. La validation reste celle du thème
-- (private.valide_theme : chemins dans le dossier de la boutique, sections
-- connues) ; cette fonction ajoute ce qu'un téléversement demande :
--   · un fichier neuf vient du dossier « marque » de la boutique ;
--   · la version lue par l'écran, comme pour le reste de la marque ;
--   · les fichiers que le thème n'emploie plus sont rendus à la console,
--     qui les retire de R2 (seulement ceux du dossier « marque » : jamais
--     une photo déposée autrement).
-- Tant que la boutique garde les sections d'accueil de son gabarit (colonne
-- `sections` vide), la console fournit ces sections : la première image
-- posée les fixe en base.


-- Tous les fichiers qu'un thème emploie.
create function private.fichiers_theme(p_theme public.themes)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(distinct x.c) filter (where x.c is not null), '{}')
    from (
      select unnest(array[p_theme.logo_chemin, p_theme.monogramme_chemin, p_theme.favicon_chemin]) as c
      union all
      select s -> 'image' ->> 'chemin' from jsonb_array_elements(coalesce(p_theme.sections, '[]'::jsonb)) s
      union all
      select s -> 'image' ->> 'chemin_portrait' from jsonb_array_elements(coalesce(p_theme.sections, '[]'::jsonb)) s
    ) x;
$$;

-- `p_image` ne dit que ce qui change : `chemin` (null = retirer), `ratio`
-- (largeur sur hauteur du logo, mesurée par la console sur le fichier),
-- `mode` du logo (« masque » : monochrome, à la couleur du texte ; « image » :
-- ses propres couleurs), `alt` (ce que montre la photo, lu aux personnes
-- aveugles et par Google ; vide = retirer).
create function public.console_image_marque(
  p_acteur uuid, p_boutique_id uuid, p_version integer, p_emplacement text, p_image jsonb,
  p_sections_gabarit jsonb default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t          public.themes;
  v_slug     text;
  v_avant    text[];
  v_apres    text[];
  v_cle      text;
  v_chemin   text;
  v_type     text;
  v_sections jsonb;
  v_i        integer;
  v_section  jsonb;
  v_img      jsonb;
  v_textes   jsonb;
  v_alt      text;
  v_trace_avant jsonb;
  v_trace_apres jsonb;
begin
  perform private.console_exige_admin(p_acteur);

  if p_emplacement is null or p_emplacement not in ('logo', 'monogramme', 'favicon', 'ouverture', 'ouverture_portrait', 'recit') then
    raise exception 'Emplacement d''image inconnu « % »', p_emplacement
      using errcode = 'check_violation', hint = 'emplacement';
  end if;
  if jsonb_typeof(p_image) is distinct from 'object' then
    raise exception 'Image : un objet {"chemin", "ratio", "mode", "alt"} est attendu' using errcode = 'check_violation';
  end if;
  for v_cle in select jsonb_object_keys(p_image) loop
    if v_cle not in ('chemin', 'ratio', 'mode', 'alt') then
      raise exception 'Image : champ « % » inconnu', v_cle using errcode = 'check_violation';
    end if;
  end loop;
  if p_image ? 'chemin' and jsonb_typeof(p_image -> 'chemin') not in ('string', 'null') then
    raise exception 'Image : chemin attendu' using errcode = 'check_violation';
  end if;
  if p_image ? 'ratio' and (p_emplacement <> 'logo' or jsonb_typeof(p_image -> 'ratio') <> 'number') then
    raise exception 'Image : seul le logo a une proportion, un nombre' using errcode = 'check_violation';
  end if;
  if p_image ? 'mode' and (p_emplacement <> 'logo' or jsonb_typeof(p_image -> 'mode') <> 'string') then
    raise exception 'Image : seul le logo a un mode d''affichage' using errcode = 'check_violation';
  end if;
  if p_image ? 'alt' and (p_emplacement not in ('ouverture', 'recit') or jsonb_typeof(p_image -> 'alt') <> 'string') then
    raise exception 'Image : seules les photos de l''accueil ont une description' using errcode = 'check_violation';
  end if;

  select b.slug into v_slug from plateforme.boutiques b where b.id = p_boutique_id;
  select * into t from public.themes th where th.boutique_id = p_boutique_id for update;
  if not found then
    raise exception 'Cette boutique n''a pas de thème' using errcode = 'no_data_found';
  end if;
  if t.version <> p_version then
    -- Pas le code 40001 : PostgREST rejouerait la transaction sans fin.
    raise exception 'Le thème a été modifié entre-temps (version % au lieu de %) : rechargez la page', t.version, p_version
      using errcode = 'check_violation', hint = 'version';
  end if;

  v_chemin := p_image ->> 'chemin';
  if v_chemin is not null and v_chemin not like v_slug || '/marque/%' then
    raise exception 'Image : un fichier du dossier « %/marque/ » est attendu', v_slug
      using errcode = 'check_violation', hint = 'chemin';
  end if;
  v_avant := private.fichiers_theme(t);

  if p_emplacement in ('logo', 'monogramme', 'favicon') then
    v_trace_avant := jsonb_build_object('chemin', case p_emplacement
      when 'logo' then t.logo_chemin when 'monogramme' then t.monogramme_chemin else t.favicon_chemin end);
    if p_emplacement = 'logo' then
      v_trace_avant := v_trace_avant || jsonb_build_object('ratio', t.logo_ratio, 'mode', t.logo_mode);
      if p_image ? 'chemin' then t.logo_chemin := v_chemin; end if;
      if p_image ? 'ratio' then t.logo_ratio := round((p_image ->> 'ratio')::numeric, 3); end if;
      -- La contrainte de la table dit les deux modes permis.
      if p_image ? 'mode' then t.logo_mode := p_image ->> 'mode'; end if;
    elsif p_image ? 'chemin' and p_emplacement = 'monogramme' then
      t.monogramme_chemin := v_chemin;
    elsif p_image ? 'chemin' then
      t.favicon_chemin := v_chemin;
    end if;
    v_trace_apres := jsonb_build_object('chemin', case p_emplacement
      when 'logo' then t.logo_chemin when 'monogramme' then t.monogramme_chemin else t.favicon_chemin end);
    if p_emplacement = 'logo' then
      v_trace_apres := v_trace_apres || jsonb_build_object('ratio', t.logo_ratio, 'mode', t.logo_mode);
    end if;

  else
    -- Une photo de l'accueil : dans la première section de son type.
    v_type := case when p_emplacement = 'recit' then 'editorial' else 'hero' end;
    v_sections := coalesce(t.sections, p_sections_gabarit);
    if v_sections is not null and jsonb_typeof(v_sections) = 'array' then
      select (e.o - 1)::integer into v_i
        from jsonb_array_elements(v_sections) with ordinality e(s, o)
       where e.s ->> 'type' = v_type
       order by e.o
       limit 1;
    end if;
    if v_i is null then
      raise exception 'L''accueil de cette boutique n''a pas de section « % » : rien où poser cette photo',
        case v_type when 'hero' then 'ouverture' else 'récit' end
        using errcode = 'check_violation', hint = 'section';
    end if;

    v_section := v_sections -> v_i;
    v_img := coalesce(v_section -> 'image', '{}'::jsonb);
    v_textes := coalesce(v_section -> 'textes', '{}'::jsonb);
    v_trace_avant := jsonb_build_object('image', v_section -> 'image', 'alt', v_textes -> 'image_alt_fr');

    if p_image ? 'chemin' then
      if p_emplacement = 'ouverture_portrait' then
        if v_chemin is null then
          v_img := v_img - 'chemin_portrait';
        elsif not v_img ? 'chemin' then
          raise exception 'Posez d''abord la photo d''ouverture : le cadrage pour téléphone la complète'
            using errcode = 'check_violation', hint = 'paysage';
        else
          v_img := v_img || jsonb_build_object('chemin_portrait', v_chemin);
        end if;
      elsif v_chemin is null then
        -- Retirer la photo retire aussi son cadrage pour téléphone.
        v_img := '{}'::jsonb;
      else
        v_img := v_img || jsonb_build_object('chemin', v_chemin);
      end if;
    end if;

    if p_image ? 'alt' then
      v_alt := nullif(btrim(p_image ->> 'alt'), '');
      if length(v_alt) > 200 then
        raise exception 'La description d''une photo tient en 200 caractères' using errcode = 'check_violation', hint = 'alt';
      end if;
      v_textes := case when v_alt is null then v_textes - 'image_alt_fr'
                       else v_textes || jsonb_build_object('image_alt_fr', v_alt) end;
    end if;

    v_section := case when v_img = '{}'::jsonb then v_section - 'image'
                      else v_section || jsonb_build_object('image', v_img) end;
    v_section := case when v_textes = '{}'::jsonb then v_section - 'textes'
                      else v_section || jsonb_build_object('textes', v_textes) end;
    t.sections := jsonb_set(v_sections, array[v_i::text], v_section);
    v_trace_apres := jsonb_build_object('image', v_section -> 'image', 'alt', v_textes -> 'image_alt_fr');
  end if;

  update public.themes th set
    logo_chemin       = t.logo_chemin,
    logo_ratio        = t.logo_ratio,
    logo_mode         = t.logo_mode,
    monogramme_chemin = t.monogramme_chemin,
    favicon_chemin    = t.favicon_chemin,
    sections          = t.sections,
    updated_by        = p_acteur
  where th.boutique_id = p_boutique_id
  returning th.* into t;

  v_apres := private.fichiers_theme(t);
  perform private.console_trace(p_acteur, p_boutique_id, 'theme.image', p_emplacement, v_trace_avant, v_trace_apres);

  return jsonb_build_object(
    'version', t.version,
    'orphelins', coalesce((select jsonb_agg(c order by c) from unnest(v_avant) c
                            where c <> all (v_apres) and c like v_slug || '/marque/%'), '[]'::jsonb));
end;
$$;

revoke execute on function private.fichiers_theme(public.themes) from public, anon, authenticated;
revoke execute on function public.console_image_marque(uuid, uuid, integer, text, jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.console_image_marque(uuid, uuid, integer, text, jsonb, jsonb) to service_role;
