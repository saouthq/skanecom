-- =====================================================================
-- SkanEcom — 14 · BACKOFFICE : LES CLIENTS (PRD §6.2 B6)
-- =====================================================================
-- En paiement à la livraison, connaître ses clients, c'est connaître son
-- risque : qui a déjà refusé un colis, qui commande souvent, qui ne répond
-- jamais. L'équipe voit la liste, la fiche (commandes, adresses, sommes
-- encaissées) et règle la confiance :
--   · normal ;
--   · surveillé — la commande passe, mais s'affiche signalée à l'appel ;
--   · bloqué — la boutique en ligne refuse ses commandes, par sa fiche comme
--     par son numéro (migration 08).
-- Un blocage dit toujours pourquoi, et passe au journal d'audit.
--
-- Comme les commandes (migration 09), la fiche ne se modifie plus par un
-- UPDATE direct de l'API : un employé pouvait sinon remettre à zéro le
-- compteur de refus d'un client. Les compteurs restent tenus par la base.
-- Gestes : propriétaire, admin, confirmation (la relation client).
-- =====================================================================

drop policy "clients: la relation client modifie" on public.clients;


-- ---------------------------------------------------------------------
-- La liste
-- ---------------------------------------------------------------------
create function public.gestion_liste_clients(
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
            or cl.nom ilike '%' || v_q || '%'
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


-- ---------------------------------------------------------------------
-- La fiche : par son identifiant, ou par son numéro (chiffres seuls),
-- depuis la fiche d'une commande
-- ---------------------------------------------------------------------
create function public.gestion_client(p_boutique_id uuid, p_cle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cl public.clients;
begin
  perform private.catalogue_exige(p_boutique_id);
  if p_cle ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select * into v_cl from public.clients c where c.boutique_id = p_boutique_id and c.id = p_cle::uuid;
  elsif regexp_replace(coalesce(p_cle, ''), '\D', '', 'g') ~ '^[0-9]{8,15}$' then
    select * into v_cl from public.clients c
     where c.boutique_id = p_boutique_id
       and right(regexp_replace(c.telephone, '\D', '', 'g'), 8) = right(regexp_replace(p_cle, '\D', '', 'g'), 8)
     order by c.user_id is not null desc, c.nb_commandes desc, c.created_at
     limit 1;
  end if;
  if v_cl.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_cl.id, 'nom', v_cl.nom, 'telephone', v_cl.telephone, 'email', v_cl.email, 'compte', v_cl.user_id is not null,
    'nb_commandes', v_cl.nb_commandes, 'nb_refus', v_cl.nb_refus, 'niveau_risque', v_cl.niveau_risque,
    'note_interne', v_cl.note_interne, 'depuis', v_cl.created_at, 'version', v_cl.updated_at,
    'chiffres', (select jsonb_build_object(
        'livrees', count(*) filter (where c.statut = 'livree'),
        'refusees', count(*) filter (where c.statut = 'refusee'),
        'annulees', count(*) filter (where c.statut = 'annulee'),
        'en_cours', count(*) filter (where c.statut in ('a_arbitrer', 'recue', 'confirmee', 'expediee')),
        'encaisse', coalesce(sum(c.total_millimes) filter (where c.statut = 'livree'), 0))
      from public.commandes c where c.boutique_id = p_boutique_id and c.client_id = v_cl.id),
    'commandes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'numero', c.numero, 'statut', c.statut, 'cree_le', c.created_at, 'total_millimes', c.total_millimes,
               'refus_origine', c.refus_origine, 'ville', c.livraison_ville,
               'articles', (select coalesce(sum(l.quantite), 0) from public.commande_lignes l
                             where l.boutique_id = c.boutique_id and l.commande_id = c.id))
             order by c.created_at desc)
        from (select * from public.commandes c
               where c.boutique_id = p_boutique_id and c.client_id = v_cl.id
               order by c.created_at desc limit 50) c), '[]'::jsonb),
    'adresses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nom', a.nom_destinataire, 'telephone', a.telephone, 'ligne1', a.ligne1, 'ligne2', a.ligne2,
               'ville', a.ville, 'gouvernorat', coalesce(g.nom_fr, a.gouvernorat_code), 'code_postal', a.code_postal,
               'par_defaut', a.par_defaut)
             order by a.par_defaut desc, a.updated_at desc)
        from public.adresses a
        left join public.gouvernorats g on g.code = a.gouvernorat_code
       where a.boutique_id = p_boutique_id and a.client_id = v_cl.id), '[]'::jsonb),
    -- Les adresses de livraison des commandes (un client en invité n'a pas de carnet).
    'livraisons', coalesce((
      select jsonb_agg(x order by x ->> 'derniere' desc) from (
        select jsonb_build_object('ligne1', c.livraison_ligne1, 'ville', c.livraison_ville,
                                  'gouvernorat', coalesce(g.nom_fr, c.livraison_gouvernorat),
                                  'fois', count(*), 'derniere', max(c.created_at)) as x
          from public.commandes c
          left join public.gouvernorats g on g.code = c.livraison_gouvernorat
         where c.boutique_id = p_boutique_id and c.client_id = v_cl.id and c.livraison_ligne1 is not null
         group by c.livraison_ligne1, c.livraison_ville, coalesce(g.nom_fr, c.livraison_gouvernorat)
         order by max(c.created_at) desc limit 5) l), '[]'::jsonb),
    'journal', coalesce((
      select jsonb_agg(jsonb_build_object('le', ja.at, 'avant', ja.avant, 'apres', ja.apres,
                                          'auteur', (select u.email from auth.users u where u.id = ja.acteur))
             order by ja.at desc)
        from plateforme.journal_audit ja
       where ja.boutique_id = p_boutique_id and ja.action = 'clients.confiance' and ja.cible = v_cl.id::text), '[]'::jsonb)
  );
end;
$$;


-- ---------------------------------------------------------------------
-- La confiance : normal, surveillé, bloqué — avec un motif
-- ---------------------------------------------------------------------
create function public.gestion_confiance_client(
  p_boutique_id uuid,
  p_client_id   uuid,
  p_niveau      text,
  p_motif       text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avant text;
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,confirmateur}');
  if p_niveau is null or p_niveau not in ('normal', 'surveille', 'bloque') then
    raise exception 'Niveau inconnu : %', p_niveau using errcode = 'check_violation', hint = 'niveau';
  end if;
  select c.niveau_risque into v_avant from public.clients c
   where c.boutique_id = p_boutique_id and c.id = p_client_id for update;
  if v_avant is null then
    raise exception 'Client introuvable' using errcode = 'no_data_found', hint = 'client';
  end if;
  if p_niveau <> 'normal' and v_motif is null then
    raise exception 'Dites pourquoi : le motif reste au journal, pour toute l''équipe'
      using errcode = 'check_violation', hint = 'motif';
  end if;
  if length(coalesce(v_motif, '')) > 300 then
    raise exception 'Motif trop long (300 caractères au plus)' using errcode = 'check_violation', hint = 'motif';
  end if;
  if v_avant = p_niveau then
    return;
  end if;

  update public.clients set niveau_risque = p_niveau where boutique_id = p_boutique_id and id = p_client_id;
  perform private.console_trace(auth.uid(), p_boutique_id, 'clients.confiance', p_client_id::text,
    jsonb_build_object('niveau', v_avant), jsonb_build_object('niveau', p_niveau, 'motif', v_motif));
end;
$$;


-- ---------------------------------------------------------------------
-- La note interne (jamais montrée au client)
-- ---------------------------------------------------------------------
create function public.gestion_note_client(p_boutique_id uuid, p_client_id uuid, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,confirmateur}');
  if length(coalesce(p_note, '')) > 2000 then
    raise exception 'Note trop longue (2 000 caractères au plus)' using errcode = 'check_violation', hint = 'note';
  end if;
  update public.clients set note_interne = nullif(btrim(coalesce(p_note, '')), '')
   where boutique_id = p_boutique_id and id = p_client_id;
  if not found then
    raise exception 'Client introuvable' using errcode = 'no_data_found', hint = 'client';
  end if;
end;
$$;


revoke execute on function public.gestion_liste_clients(uuid, text, text, integer, integer) from public, anon;
revoke execute on function public.gestion_client(uuid, text)                                from public, anon;
revoke execute on function public.gestion_confiance_client(uuid, uuid, text, text)          from public, anon;
revoke execute on function public.gestion_note_client(uuid, uuid, text)                     from public, anon;
grant  execute on function public.gestion_liste_clients(uuid, text, text, integer, integer) to authenticated;
grant  execute on function public.gestion_client(uuid, text)                                to authenticated;
grant  execute on function public.gestion_confiance_client(uuid, uuid, text, text)          to authenticated;
grant  execute on function public.gestion_note_client(uuid, uuid, text)                     to authenticated;
