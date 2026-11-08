-- ============================================================================
-- LA COQUILLE DU BACKOFFICE EN UNE LECTURE — l'état des modules pour la
-- navigation (SAV, devis, avis, promotions, alertes, paniers, visites,
-- lettre, SkanFact, annonces, demandes, conditions, maintenance) était lu en
-- seize appels, et vinext exécute le layout deux fois (un essai, puis le
-- rendu) : une page du backoffice dépassait les 50 appels sortants qu'un
-- Worker gratuit permet par requête (« Too many subrequests »).
--
-- Une seule fonction, qui appelle les mêmes (chacune revérifie l'accès,
-- comme avant) : sous les droits de l'appelant (security invoker), et une
-- lecture illisible rend null pour elle seule — la page s'ouvre quand même,
-- comme quand chaque appel était séparé.
-- ============================================================================

create function public.gestion_coquille(p_boutique_id uuid, p_suspendue boolean default false)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_r jsonb := '{}'::jsonb;
  v_v jsonb;
  v_nom text;
begin
  foreach v_nom in array array['gestion_sav_etat', 'gestion_pro_etat', 'gestion_devis_etat', 'gestion_avis_etat',
    'gestion_promotions_etat', 'gestion_alertes_etat', 'gestion_paniers_etat', 'gestion_visites_etat',
    'gestion_lettre_etat', 'gestion_skanfact_etat', 'gestion_annonces', 'gestion_demandes_etat',
    'gestion_conditions_etat'] || case when p_suspendue then array['gestion_suspension'] else array[]::text[] end
  loop
    begin
      execute format('select public.%I($1)', v_nom) into v_v using p_boutique_id;
    exception when others then
      v_v := null;
    end;
    v_r := v_r || jsonb_build_object(v_nom, v_v);
  end loop;
  begin
    v_v := public.maintenance_etat();
  exception when others then
    v_v := null;
  end;
  return v_r || jsonb_build_object('maintenance_etat', v_v);
end;
$$;

revoke execute on function public.gestion_coquille(uuid, boolean) from public, anon;
grant  execute on function public.gestion_coquille(uuid, boolean) to authenticated;
