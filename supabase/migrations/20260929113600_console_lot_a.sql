-- =====================================================================
-- LA CONSOLE, LOT A — les défauts visibles
--
-- · Une boutique fermée ne compte plus comme cliente d'une formule (le
--   nombre de boutiques d'une formule, « sans formule ») : console_formules
--   rend le statut de chaque boutique, l'écran l'écarte.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.console_formules(p_acteur uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.console_exige_admin(p_acteur);
  return jsonb_build_object(
    'formules', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', f.code, 'nom', f.nom, 'description', f.description, 'prix', f.prix_mensuel_millimes,
               'position', f.position,
               'droits', coalesce((select jsonb_agg(fd.droit order by fd.droit) from plateforme.formule_droits fd where fd.formule = f.code), '[]'::jsonb),
               'boutiques', (select count(*) from plateforme.boutiques b where b.formule = f.code and b.statut <> 'fermee'))
             order by f.position, f.code)
        from plateforme.formules f), '[]'::jsonb),
    'droits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', d.code, 'genre', d.genre, 'groupe', d.groupe, 'libelle', d.libelle_fr, 'description', d.description_fr,
               'disponible', d.module is null or (select m.disponible from plateforme.modules m where m.code = d.module))
             order by d.groupe, d.position, d.code)
        from plateforme.droits d), '[]'::jsonb),
    'boutiques', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'slug', b.slug, 'nom', b.nom, 'formule', b.formule, 'demonstration', b.demonstration, 'statut', b.statut)
             order by b.nom)
        from plateforme.boutiques b), '[]'::jsonb)
  );
end;
$function$;

-- Supprimer une formule que seules des boutiques fermées portaient encore :
-- elles la quittent (« Sur mesure » si elles rouvrent un jour, ce que le
-- journal dit) ; une boutique encore en activité l'empêche toujours.
CREATE OR REPLACE FUNCTION public.console_supprimer_formule(p_acteur uuid, p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_n integer;
  v_b record;
begin
  if private.console_exige_admin(p_acteur) <> 'super_admin' then
    raise exception 'Seul un super-administrateur change les formules' using errcode = 'insufficient_privilege';
  end if;
  select count(*) into v_n from plateforme.boutiques b where b.formule = p_code and b.statut <> 'fermee';
  if v_n > 0 then
    raise exception 'Formule encore vendue à % boutique%s : changez-les d''abord de formule', v_n, case when v_n > 1 then 's' else '' end
      using errcode = 'check_violation', hint = 'utilisee';
  end if;
  for v_b in select x.id from plateforme.boutiques x where x.formule = p_code and x.statut = 'fermee' loop
    update plateforme.boutiques set formule = null where id = v_b.id;
    perform private.console_trace(p_acteur, v_b.id, 'boutique.formule', null, jsonb_build_object('formule', p_code), jsonb_build_object('formule', null));
  end loop;
  delete from plateforme.formules f where f.code = p_code;
  if not found then
    raise exception 'Formule introuvable' using errcode = 'no_data_found';
  end if;
  perform private.console_trace(p_acteur, null, 'formule.supprimer', p_code, null, null);
end;
$function$;
