-- =====================================================================
-- SkanEcom — 19 · BACKOFFICE : LA VEILLE DES NOUVELLES COMMANDES
-- =====================================================================
-- Le backoffice ouvert se renseigne toutes les minutes environ : combien de
-- commandes attendent l'appel de confirmation, et quelle est la dernière
-- arrivée. De quoi tenir un compteur dans la navigation et, si la personne
-- l'a accepté, une notification du navigateur. Une lecture minuscule, pour
-- toute l'équipe.
-- =====================================================================

create function public.gestion_veille(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'a_confirmer', (select count(*) from public.commandes c
                     where c.boutique_id = p_boutique_id and c.statut in ('a_arbitrer', 'recue')),
    'derniere', (select jsonb_build_object('numero', c.numero, 'nom', c.contact_nom, 'total', c.total_millimes,
                                           'le', c.created_at, 'statut', c.statut)
                   from public.commandes c
                  where c.boutique_id = p_boutique_id
                  order by c.created_at desc, c.numero desc
                  limit 1));
end;
$$;

revoke execute on function public.gestion_veille(uuid) from public, anon;
grant  execute on function public.gestion_veille(uuid) to authenticated;
