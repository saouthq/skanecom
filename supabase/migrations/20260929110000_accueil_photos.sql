-- =====================================================================
-- 61 · Les photos de l'accueil, depuis le backoffice
-- =====================================================================
-- Le propriétaire change la photo d'ouverture pour la saison, celle du
-- récit, le cadrage pour téléphone : l'écran « Page d'accueil » les
-- téléverse (la route vérifie le fichier, le dépose sous
-- `<boutique>/accueil/photo-…`) et les pose dans la section ; la
-- validation du thème garde la photo dans le dossier de la boutique.
--
-- À l'enregistrement, la base dit quelles photos l'accueil n'emploie plus
-- (`orphelins`) ; la route ne retire du dépôt que celles du backoffice —
-- jamais une photo posée par la console ni une photo du jeu de démo.

create or replace function public.gestion_enregistrer_accueil(p_boutique_id uuid, p_sections jsonb, p_version integer)
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
    raise exception 'L''accueil a été modifié entre-temps : rechargez-le avant d''enregistrer'
      using errcode = 'check_violation', hint = 'version';
  end if;
  -- NULL rend les sections du gabarit ; une liste vide ne laisserait qu'un
  -- en-tête et un pied de page.
  if p_sections is not null and (jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) = 0) then
    raise exception 'L''accueil garde une section au moins' using errcode = 'check_violation', hint = 'vide';
  end if;

  begin
    update public.themes t set sections = p_sections, updated_by = auth.uid()
     where t.boutique_id = p_boutique_id
    returning * into v_apres;
  exception when check_violation then
    raise exception '%', sqlerrm using errcode = 'check_violation', hint = 'section';
  end;

  perform private.console_trace(auth.uid(), p_boutique_id, 'accueil.modifier', 'accueil',
    jsonb_build_object('sections', (select jsonb_agg(x ->> 'type') from jsonb_array_elements(coalesce(v_avant.sections, '[]'::jsonb)) x)),
    jsonb_build_object('sections', (select jsonb_agg(x ->> 'type') from jsonb_array_elements(coalesce(v_apres.sections, '[]'::jsonb)) x)));
  -- Les photos que l'accueil n'emploie plus : la route retire du dépôt
  -- celles que le backoffice y avait mises.
  return jsonb_build_object('version', v_apres.version, 'orphelins', coalesce((
    select jsonb_agg(distinct a.chemin order by a.chemin)
      from (select s -> 'image' ->> 'chemin' as chemin from jsonb_array_elements(coalesce(v_avant.sections, '[]'::jsonb)) s
            union
            select s -> 'image' ->> 'chemin_portrait' from jsonb_array_elements(coalesce(v_avant.sections, '[]'::jsonb)) s) a
     where a.chemin is not null
       and a.chemin not in (select x.c
                              from jsonb_array_elements(coalesce(v_apres.sections, '[]'::jsonb)) s,
                                   lateral (values (s -> 'image' ->> 'chemin'), (s -> 'image' ->> 'chemin_portrait')) x(c)
                             where x.c is not null)), '[]'::jsonb));
end;
$$;


comment on function public.gestion_enregistrer_accueil(uuid, jsonb, integer) is
  'Enregistre les sections de l''accueil (propriétaire, administrateur ; NULL = celles du gabarit). La version lue est exigée (indice « version »), la forme est celle du thème (indice « section »). Rend la nouvelle version et les photos que l''accueil n''emploie plus (orphelins). Tracé au journal (accueil.modifier).';
