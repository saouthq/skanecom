-- =====================================================================
-- L'ALLURE DE L'INTERFACE — un réglage de plus à l'écran « Apparence ».
--
-- « classique » (le défaut, celui de chaque gabarit) : les filets et les
-- cases du gabarit. « contemporaine » : des commandes pleines et arrondies,
-- des titres de page alignés et grands, des barres d'outils en verre
-- (application/src/app/allure.css). Un nouveau réglage est coupé par
-- défaut : une clé absente garde le choix du gabarit.
--
-- La validation commune au thème et au brouillon (private.valide_apparence,
-- migration 20260929110300) admet la nouvelle clé ; le reste à l'identique.
-- =====================================================================

create or replace function private.valide_apparence(p_couleurs jsonb, p_polices jsonb, p_style jsonb)
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
    "animations": ["oui", "non"],
    "allure": ["classique", "contemporaine"]
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

comment on column public.themes.style is
  'Le style par-dessus le gabarit, en listes fermées : coins (droits, doux, arrondis, ronds), boutons (pleins, contour, pilule), teinte des boutons (encre, accent), cartes (nues, cadre, ombre), photos (4-5, 1-1, 3-4), titres (sobre, ample, immense), casse (normale, majuscules), densite (serree, normale, aeree), mode (clair, sombre), animations (oui, non), allure (classique, contemporaine). Clé absente = le choix du gabarit.';
