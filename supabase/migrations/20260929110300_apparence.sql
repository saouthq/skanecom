-- =====================================================================
-- SkanEcom — 64 · L'APPARENCE DE LA VITRINE, RÉGLÉE PAR SON ÉQUIPE
-- =====================================================================
--
-- Jusqu'ici, l'allure d'une boutique se posait à sa mise en place (la
-- console : le gabarit, la palette, les polices) et ne bougeait plus. Le
-- propriétaire veut la tenir lui-même, et voir avant de publier : une
-- couleur pour la saison, des coins arrondis, des boutons en pilule, un
-- mode sombre.
--
-- 1. public.themes.style : le style par-dessus le gabarit, en listes
--    fermées — les coins, les boutons (leur forme, leur teinte), les cartes
--    des produits, le format de leurs photos, la taille et la casse des
--    titres, la densité, le mode (clair, sombre), les animations. Une clé
--    absente = le choix du gabarit. La feuille du thème finit dans une
--    balise <style> : aucune valeur libre (même règle que les couleurs et
--    les polices).
-- 2. Six familles de plus (Bodoni Moda, Fraunces, Syne, Space Grotesk pour
--    les titres ; Manrope et DM Sans pour les titres et le texte), servies
--    par l'application.
-- 3. Le brouillon (public.themes_brouillons) : ce que l'équipe essaie, à
--    part du thème publié — la vitrine ne le lit jamais, et l'enregistrer
--    ne dérange pas un collègue qui compose l'accueil (la version du thème
--    ne bouge qu'à la publication). Il a sa propre version : deux
--    personnes qui l'enregistrent ensemble ne s'écrasent pas.
-- 4. public.gestion_apparence (l'équipe lit), gestion_brouillon_apparence
--    et gestion_publier_apparence (propriétaire, administrateur ; la
--    publication est tracée).
-- 5. public.apercu_apparence : la vitrine rend le brouillon à qui présente
--    le jeton de son aperçu (le cadre du backoffice, un lien ouvert sur le
--    téléphone du propriétaire) ; tout autre visiteur voit ce qui est publié.

-- ---------------------------------------------------------------------
-- 1 et 2. La colonne, et la validation commune au thème et au brouillon
-- ---------------------------------------------------------------------
alter table public.themes add column style jsonb not null default '{}'::jsonb;

comment on column public.themes.style is
  'Le style par-dessus le gabarit, en listes fermées : coins (droits, doux, arrondis, ronds), boutons (pleins, contour, pilule), teinte des boutons (encre, accent), cartes (nues, cadre, ombre), photos (4-5, 1-1, 3-4), titres (sobre, ample, immense), casse (normale, majuscules), densite (serree, normale, aeree), mode (clair, sombre), animations (oui, non). Clé absente = le choix du gabarit.';

create function private.valide_apparence(p_couleurs jsonb, p_polices jsonb, p_style jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  e record;
  v_permis jsonb := '{
    "coins": ["droits", "doux", "arrondis", "ronds"],
    "boutons": ["pleins", "contour", "pilule"],
    "teinte": ["encre", "accent"],
    "cartes": ["nues", "cadre", "ombre"],
    "photos": ["4-5", "1-1", "3-4"],
    "titres": ["sobre", "ample", "immense"],
    "casse": ["normale", "majuscules"],
    "densite": ["serree", "normale", "aeree"],
    "mode": ["clair", "sombre"],
    "animations": ["oui", "non"]
  }'::jsonb;
begin
  -- Couleurs : 13 jetons connus, #RRGGBB.
  if jsonb_typeof(p_couleurs) is distinct from 'object' then
    raise exception 'themes.couleurs : un objet est attendu' using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_each(p_couleurs) loop
    if e.key not in ('fond', 'surface', 'surface_2', 'filet', 'filet_fort', 'contour_champ',
                     'encre', 'encre_doux', 'accent', 'accent_clair', 'succes', 'erreur', 'alerte') then
      raise exception 'themes.couleurs : jeton inconnu « % »', e.key using errcode = 'check_violation';
    end if;
    if jsonb_typeof(e.value) <> 'string' or (e.value #>> '{}') !~ '^#[0-9A-Fa-f]{6}$' then
      raise exception 'themes.couleurs : « % » doit valoir #RRGGBB', e.key using errcode = 'check_violation';
    end if;
  end loop;

  -- Polices : les familles servies par l'application.
  if jsonb_typeof(p_polices) is distinct from 'object' then
    raise exception 'themes.polices : un objet est attendu' using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_each(p_polices) loop
    if not ((e.key = 'titres' and e.value in ('"instrument-serif"', '"instrument-sans"', '"archivo"', '"young-serif"', '"plex-sans"',
                                              '"bodoni-moda"', '"fraunces"', '"syne"', '"space-grotesk"', '"manrope"', '"dm-sans"'))
            or (e.key = 'texte' and e.value in ('"instrument-sans"', '"archivo"', '"plex-sans"', '"manrope"', '"dm-sans"'))) then
      raise exception 'themes.polices : « % » = % n''est pas une police disponible', e.key, e.value
        using errcode = 'check_violation';
    end if;
  end loop;

  -- Style : des clés et des valeurs de la liste.
  if jsonb_typeof(p_style) is distinct from 'object' then
    raise exception 'themes.style : un objet est attendu' using errcode = 'check_violation';
  end if;
  for e in select * from jsonb_each(p_style) loop
    if not v_permis ? e.key then
      raise exception 'themes.style : réglage inconnu « % »', e.key using errcode = 'check_violation';
    end if;
    if jsonb_typeof(e.value) <> 'string' or not (v_permis -> e.key) ? (e.value #>> '{}') then
      raise exception 'themes.style : « % » ne peut valoir %', e.key, e.value using errcode = 'check_violation';
    end if;
  end loop;
end;
$$;

comment on function private.valide_apparence(jsonb, jsonb, jsonb) is
  'Les couleurs (13 jetons, #RRGGBB), les polices (familles servies) et le style (listes fermées) d''un thème ou d''un brouillon ; check_violation sinon.';

-- La validation du thème (migration 59), qui délègue désormais couleurs,
-- polices et style à private.valide_apparence ; le reste à l'identique.
create or replace function private.valide_theme()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s jsonb;
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
  if new.sections is not null then
    if jsonb_typeof(new.sections) <> 'array' or jsonb_array_length(new.sections) > 12 then
      raise exception 'themes.sections : une liste de 12 sections au plus est attendue' using errcode = 'check_violation';
    end if;
    for s in select * from jsonb_array_elements(new.sections) loop
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
  end if;

  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

revoke execute on function private.valide_apparence(jsonb, jsonb, jsonb) from public, anon, authenticated;

-- La console règle aussi le style (même champ, même validation).
create or replace function public.console_modifier_theme(p_acteur uuid, p_boutique_id uuid, p_version integer, p_theme jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant   jsonb;
  v_version integer;
  v_cle     text;
begin
  perform private.console_exige_admin(p_acteur);

  for v_cle in select jsonb_object_keys(p_theme) loop
    if v_cle not in ('code', 'couleurs', 'polices', 'style', 'textes', 'logo_mode') then
      raise exception 'Thème : champ « % » non modifiable ici', v_cle using errcode = 'check_violation';
    end if;
  end loop;

  select to_jsonb(t) - 'boutique_id' - 'updated_at' - 'updated_by', t.version
    into v_avant, v_version
    from public.themes t where t.boutique_id = p_boutique_id for update;
  if v_avant is null then
    raise exception 'Cette boutique n''a pas de thème' using errcode = 'no_data_found';
  end if;
  if v_version <> p_version then
    -- Pas le code 40001 (serialization_failure) : PostgREST rejoue d'office
    -- une transaction en conflit de sérialisation, sans fin ici.
    raise exception 'Le thème a été modifié entre-temps (version % au lieu de %) : rechargez la page', v_version, p_version
      using errcode = 'check_violation', hint = 'version';
  end if;

  update public.themes t set
    code      = coalesce(p_theme ->> 'code', t.code),
    couleurs  = coalesce(p_theme -> 'couleurs', t.couleurs),
    polices   = coalesce(p_theme -> 'polices', t.polices),
    style     = coalesce(p_theme -> 'style', t.style),
    textes    = coalesce(p_theme -> 'textes', t.textes),
    logo_mode = coalesce(p_theme ->> 'logo_mode', t.logo_mode),
    updated_by = p_acteur
  where t.boutique_id = p_boutique_id
  returning t.version into v_version;

  perform private.console_trace(p_acteur, p_boutique_id, 'theme.modifier', null, v_avant, p_theme);
  return v_version;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. Le brouillon
-- ---------------------------------------------------------------------
create table public.themes_brouillons (
  boutique_id uuid primary key references plateforme.boutiques (id) on delete cascade,
  -- {"code": "editorial", "couleurs": {…}, "polices": {…}, "style": {…}}
  contenu     jsonb not null,
  version     integer not null default 1,
  -- Le jeton de l'aperçu : la vitrine rend le brouillon à qui le présente
  -- (le cadre de l'écran « Apparence », le lien ouvert sur un téléphone).
  -- Tiré au hasard, gardé tant que le brouillon existe.
  jeton       uuid not null default gen_random_uuid(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

comment on table public.themes_brouillons is
  'L''apparence que l''équipe essaie avant de la publier (gabarit, couleurs, polices, style). Jamais lue par la vitrine ; lue et écrite par les fonctions gestion_*_apparence seulement.';

create trigger themes_brouillons_boutique_immuable
  before update of boutique_id on public.themes_brouillons
  for each row execute function private.boutique_immuable();

-- Aucune politique : personne ne lit ni n'écrit la table directement (le
-- relevé d'isolation, 02, la compte comme les autres : zéro ligne).
alter table public.themes_brouillons enable row level security;

-- La forme d'un brouillon ou d'une publication : les quatre champs, et
-- rien d'autre.
create function private.valide_contenu_apparence(p_contenu jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(p_contenu) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_contenu) k where k not in ('code', 'couleurs', 'polices', 'style'))
     or not (p_contenu ? 'code' and p_contenu ? 'couleurs' and p_contenu ? 'polices' and p_contenu ? 'style') then
    raise exception 'Apparence : {code, couleurs, polices, style} attendu' using errcode = 'check_violation', hint = 'forme';
  end if;
  if (p_contenu ->> 'code') is null or (p_contenu ->> 'code') not in ('editorial', 'technique') then
    raise exception 'Apparence : gabarit inconnu %', p_contenu -> 'code' using errcode = 'check_violation', hint = 'forme';
  end if;
  begin
    perform private.valide_apparence(p_contenu -> 'couleurs', p_contenu -> 'polices', p_contenu -> 'style');
  exception when check_violation then
    raise exception '%', sqlerrm using errcode = 'check_violation', hint = 'forme';
  end;
end;
$$;

revoke execute on function private.valide_contenu_apparence(jsonb) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. L'équipe : lire, essayer, publier
-- ---------------------------------------------------------------------
create function public.gestion_apparence(p_boutique_id uuid)
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
      'code', v_theme.code, 'couleurs', v_theme.couleurs, 'polices', v_theme.polices, 'style', v_theme.style) end,
    'modifie_le', v_theme.updated_at,
    'modifie_par', (select u.email from auth.users u where u.id = v_theme.updated_by),
    'brouillon', case when v_brouillon.boutique_id is null then null else jsonb_build_object(
      'contenu', v_brouillon.contenu, 'version', v_brouillon.version, 'jeton', v_brouillon.jeton, 'modifie_le', v_brouillon.updated_at,
      'modifie_par', (select u.email from auth.users u where u.id = v_brouillon.updated_by)) end
  );
end;
$$;

comment on function public.gestion_apparence(uuid) is
  'L''apparence de la boutique pour son équipe : ce qui est publié (gabarit, couleurs, polices, style) et sa version, le brouillon en cours (sa version, qui et quand).';

-- Enregistrer le brouillon (NULL : l'abandonner). `p_version` est la
-- version du brouillon lue (NULL quand il n'y en avait pas) : si un collègue
-- l'a enregistré entre-temps, on refuse plutôt que d'écraser son essai.
create function public.gestion_brouillon_apparence(p_boutique_id uuid, p_contenu jsonb, p_version integer)
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
    return jsonb_build_object('version', null, 'jeton', null);
  end if;

  perform private.valide_contenu_apparence(p_contenu);
  insert into public.themes_brouillons as b (boutique_id, contenu, updated_by)
  values (p_boutique_id, p_contenu, auth.uid())
  on conflict (boutique_id) do update
     set contenu = excluded.contenu, version = b.version + 1, updated_at = now(), updated_by = auth.uid()
  returning b.version, b.jeton into v_version, v_jeton;
  return jsonb_build_object('version', v_version, 'jeton', v_jeton);
end;
$$;

comment on function public.gestion_brouillon_apparence(uuid, jsonb, integer) is
  'Enregistre le brouillon de l''apparence (propriétaire, administrateur ; NULL l''abandonne). La version du brouillon lue est exigée (indice « version », NULL s''il n''y en avait pas), la forme est vérifiée (indice « forme »). Ne touche pas au thème publié.';

-- Publier : l'apparence passe dans le thème (la vitrine la montre), le
-- brouillon s'efface. `p_version` est la version du THÈME lue à
-- l'ouverture : publier par-dessus une apparence changée entre-temps (par la
-- console, par un collègue) est refusé.
create function public.gestion_publier_apparence(p_boutique_id uuid, p_contenu jsonb, p_version integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant public.themes;
  v_apres public.themes;
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
  perform private.valide_contenu_apparence(p_contenu);

  update public.themes t
     set code = p_contenu ->> 'code', couleurs = p_contenu -> 'couleurs', polices = p_contenu -> 'polices',
         style = p_contenu -> 'style', updated_by = auth.uid()
   where t.boutique_id = p_boutique_id
  returning * into v_apres;
  delete from public.themes_brouillons b where b.boutique_id = p_boutique_id;

  perform private.console_trace(auth.uid(), p_boutique_id, 'apparence.publier', 'apparence',
    jsonb_build_object('code', v_avant.code, 'couleurs', v_avant.couleurs, 'polices', v_avant.polices, 'style', v_avant.style),
    p_contenu);
  return jsonb_build_object('version', v_apres.version);
end;
$$;

comment on function public.gestion_publier_apparence(uuid, jsonb, integer) is
  'Publie l''apparence (propriétaire, administrateur) : gabarit, couleurs, polices et style passent dans le thème, le brouillon s''efface. La version du thème lue est exigée (indice « version »), la forme est vérifiée (indice « forme »). Tracé au journal (apparence.publier).';

-- ---------------------------------------------------------------------
-- 5. La vitrine : l'aperçu du brouillon, à qui présente son jeton
-- ---------------------------------------------------------------------
-- Ce qui est rendu : l'apparence essayée, rien d'autre (ni qui l'a écrite,
-- ni quand). Un jeton faux, périmé (brouillon publié ou abandonné) ou d'une
-- autre boutique ne rend rien : la vitrine montre ce qui est publié.
create function public.apercu_apparence(p_slug text, p_jeton uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select b.contenu
    from public.themes_brouillons b
    join plateforme.boutiques x on x.id = b.boutique_id
   where x.slug = p_slug and x.statut = 'active' and b.jeton = p_jeton;
$$;

comment on function public.apercu_apparence(text, uuid) is
  'L''apparence du brouillon d''une boutique ouverte, pour qui présente le jeton de son aperçu (vitrine) ; NULL sinon.';

grant execute on function public.apercu_apparence(text, uuid) to anon, authenticated;

revoke execute on function public.gestion_apparence(uuid),
                           public.gestion_brouillon_apparence(uuid, jsonb, integer),
                           public.gestion_publier_apparence(uuid, jsonb, integer) from public, anon;
grant  execute on function public.gestion_apparence(uuid),
                           public.gestion_brouillon_apparence(uuid, jsonb, integer),
                           public.gestion_publier_apparence(uuid, jsonb, integer) to authenticated;
