-- =====================================================================
-- LA RECHERCHE DES CLIENTS, SANS ACCENTS (10/11, parcours en vrai)
-- =====================================================================
-- Comme celle des commandes (migration …_recherche_commandes) : « ines »
-- trouve Inès, « héla » Hela. L'adresse e-mail et le numéro, comme avant.
-- Définition reprise de la migration …_gestion_clients (la seule).
-- =====================================================================

create or replace function public.gestion_liste_clients(
  p_boutique_id uuid,
  p_filtre      text default 'tous',
  p_recherche   text default null,
  p_limite      integer default 50,
  p_decalage    integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q      text := nullif(btrim(coalesce(p_recherche, '')), '');
  v_chiffres text := nullif(regexp_replace(coalesce(p_recherche, ''), '\D', '', 'g'), '');
  v_res    jsonb;
begin
  perform private.catalogue_exige(p_boutique_id);
  if p_filtre is null or p_filtre not in ('tous', 'fideles', 'refus', 'surveilles', 'bloques') then
    raise exception 'Filtre inconnu : %', p_filtre using errcode = 'check_violation', hint = 'filtre';
  end if;

  with base as (
    select cl.*,
           (select count(*) from public.commandes c where c.boutique_id = cl.boutique_id and c.client_id = cl.id and c.statut = 'livree') as livrees,
           (select coalesce(sum(c.total_millimes), 0) from public.commandes c
             where c.boutique_id = cl.boutique_id and c.client_id = cl.id and c.statut = 'livree') as encaisse,
           (select max(c.created_at) from public.commandes c where c.boutique_id = cl.boutique_id and c.client_id = cl.id) as derniere
      from public.clients cl
     where cl.boutique_id = p_boutique_id
       and (v_q is null
            or public.sans_accents(cl.nom) ilike '%' || public.sans_accents(v_q) || '%'
            or cl.email ilike '%' || v_q || '%'
            or (v_chiffres is not null and length(v_chiffres) >= 3
                and regexp_replace(cl.telephone, '\D', '', 'g') like '%' || v_chiffres || '%'))
  ),
  filtre as (
    select * from base b
     where case p_filtre
             when 'fideles'    then b.livrees >= 2
             when 'refus'      then b.nb_refus > 0
             when 'surveilles' then b.niveau_risque = 'surveille'
             when 'bloques'    then b.niveau_risque = 'bloque'
             else true end
  )
  select jsonb_build_object(
    'filtre', p_filtre,
    'total', (select count(*) from filtre),
    'compteurs', (select jsonb_build_object(
        'tous', count(*),
        'fideles', count(*) filter (where b.livrees >= 2),
        'refus', count(*) filter (where b.nb_refus > 0),
        'surveilles', count(*) filter (where b.niveau_risque = 'surveille'),
        'bloques', count(*) filter (where b.niveau_risque = 'bloque'))
      from base b),
    'clients', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'nom', f.nom, 'telephone', f.telephone, 'email', f.email, 'compte', f.user_id is not null,
               'nb_commandes', f.nb_commandes, 'nb_refus', f.nb_refus, 'livrees', f.livrees, 'encaisse', f.encaisse,
               'niveau_risque', f.niveau_risque, 'derniere_commande', f.derniere, 'depuis', f.created_at)
             order by f.derniere desc nulls last, f.created_at desc)
        from (select * from filtre order by derniere desc nulls last, created_at desc
              limit greatest(1, least(coalesce(p_limite, 50), 200)) offset greatest(0, coalesce(p_decalage, 0))) f), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;
