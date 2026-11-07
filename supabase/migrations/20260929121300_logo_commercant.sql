-- =====================================================================
-- LE LOGO POSÉ PAR LE COMMERÇANT (07/11, demandé par Skander)
-- =====================================================================
-- Jusqu'ici, seule la console posait le logo d'une boutique (onglet
-- Marque). Le propriétaire et l'administrateur le posent désormais depuis
-- l'éditeur de la vitrine : le logo, le monogramme et l'icône d'onglet —
-- les photos de l'accueil ont déjà leur chemin (l'accueil de l'éditeur).
--
-- Mêmes vérifications que public.console_image_marque : l'emplacement, la
-- forme de l'image, le fichier rangé sous « <boutique>/marque/ », la
-- version du thème lue (deux onglets ne se marchent pas dessus). Le thème
-- change aussitôt (le logo ne passe pas par le brouillon de l'éditeur) ;
-- la fonction rend la nouvelle version, que l'éditeur garde pour publier
-- ensuite, et les fichiers que plus rien n'emploie (la route les retire).
-- =====================================================================

create function public.gestion_image_marque(p_boutique_id uuid, p_version integer, p_emplacement text, p_image jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t       public.themes;
  v_slug  text;
  v_avant text[];
  v_apres text[];
  v_cle   text;
  v_chemin text;
  v_trace_avant jsonb;
  v_trace_apres jsonb;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');

  if p_emplacement is null or p_emplacement not in ('logo', 'monogramme', 'favicon') then
    raise exception 'Emplacement d''image inconnu « % »', p_emplacement
      using errcode = 'check_violation', hint = 'emplacement';
  end if;
  if jsonb_typeof(p_image) is distinct from 'object' then
    raise exception 'Image : un objet {"chemin", "ratio", "mode"} est attendu' using errcode = 'check_violation';
  end if;
  for v_cle in select jsonb_object_keys(p_image) loop
    if v_cle not in ('chemin', 'ratio', 'mode') then
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

  select b.slug into v_slug from plateforme.boutiques b where b.id = p_boutique_id;
  select * into t from public.themes th where th.boutique_id = p_boutique_id for update;
  if not found then
    raise exception 'La boutique n''a pas encore de thème : la console le pose à sa mise en place'
      using errcode = 'check_violation', hint = 'theme';
  end if;
  if t.version <> p_version then
    raise exception 'L''apparence a été modifiée entre-temps (version % au lieu de %) : rechargez la page', t.version, p_version
      using errcode = 'check_violation', hint = 'version';
  end if;

  v_chemin := p_image ->> 'chemin';
  if v_chemin is not null and v_chemin not like v_slug || '/marque/%' then
    raise exception 'Image : un fichier du dossier « %/marque/ » est attendu', v_slug
      using errcode = 'check_violation', hint = 'chemin';
  end if;
  v_avant := private.fichiers_theme(t);

  v_trace_avant := jsonb_build_object('chemin', case p_emplacement
    when 'logo' then t.logo_chemin when 'monogramme' then t.monogramme_chemin else t.favicon_chemin end);
  if p_emplacement = 'logo' then
    v_trace_avant := v_trace_avant || jsonb_build_object('ratio', t.logo_ratio, 'mode', t.logo_mode);
    if p_image ? 'chemin' then t.logo_chemin := v_chemin; end if;
    if p_image ? 'ratio' then t.logo_ratio := round((p_image ->> 'ratio')::numeric, 3); end if;
    if p_image ? 'mode' then t.logo_mode := p_image ->> 'mode'; end if;
  elsif p_image ? 'chemin' and p_emplacement = 'monogramme' then
    t.monogramme_chemin := v_chemin;
  elsif p_image ? 'chemin' then
    t.favicon_chemin := v_chemin;
  end if;

  update public.themes th set
    logo_chemin       = t.logo_chemin,
    logo_ratio        = t.logo_ratio,
    logo_mode         = t.logo_mode,
    monogramme_chemin = t.monogramme_chemin,
    favicon_chemin    = t.favicon_chemin,
    updated_by        = auth.uid()
  where th.boutique_id = p_boutique_id
  returning th.* into t;

  v_trace_apres := jsonb_build_object('chemin', case p_emplacement
    when 'logo' then t.logo_chemin when 'monogramme' then t.monogramme_chemin else t.favicon_chemin end);
  if p_emplacement = 'logo' then
    v_trace_apres := v_trace_apres || jsonb_build_object('ratio', t.logo_ratio, 'mode', t.logo_mode);
  end if;
  v_apres := private.fichiers_theme(t);
  perform private.console_trace(auth.uid(), p_boutique_id, 'theme.image', p_emplacement, v_trace_avant, v_trace_apres);

  return jsonb_build_object(
    'version', t.version,
    'logo', case when t.logo_chemin is null then null
                 else jsonb_build_object('chemin', t.logo_chemin, 'ratio', t.logo_ratio, 'mode', t.logo_mode) end,
    'monogramme', t.monogramme_chemin,
    'favicon', t.favicon_chemin,
    'orphelins', coalesce((select jsonb_agg(c order by c) from unnest(v_avant) c
                            where c <> all (v_apres) and c like v_slug || '/marque/%'), '[]'::jsonb));
end;
$$;
comment on function public.gestion_image_marque(uuid, integer, text, jsonb) is
  'Le logo, le monogramme ou l''icône d''onglet, posé, changé ou retiré par le propriétaire ou l''administrateur (éditeur de la vitrine). La version du thème lue est exigée (indice « version ») ; un fichier hors de « <boutique>/marque/ » est refusé (indice « chemin »). Rend la nouvelle version, les images à jour et les fichiers que plus rien n''emploie. Tracé au journal (theme.image).';
revoke execute on function public.gestion_image_marque(uuid, integer, text, jsonb) from public, anon;
grant  execute on function public.gestion_image_marque(uuid, integer, text, jsonb) to authenticated;
