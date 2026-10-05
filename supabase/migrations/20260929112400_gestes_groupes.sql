-- =====================================================================
-- SkanEcom — 85 · LES GESTES GROUPÉS : REMETTRE AU LIVREUR, LIVRÉES D'UN COUP
-- =====================================================================
--
-- Le livreur passe prendre vingt colis ; le soir, il rend son point du jour.
-- Jusqu'ici, chaque colis se marquait expédié puis livré depuis sa fiche.
-- Désormais, depuis la liste des commandes :
--
--   · « À préparer » : on coche les colis remis au livreur (ou « Tout ») et
--     on les marque expédiés d'un geste, avec le nom du transporteur ;
--   · « Expédiées » : on coche ceux qu'il a livrés et on les marque livrés,
--     paiement encaissé, d'un geste. Un refus, lui, se dit commande par
--     commande (son origine est obligatoire).
--
-- Chaque commande suit le chemin d'un geste fait sur sa fiche (journal,
-- facture SkanFact, encaissements) ; celles qui ont bougé entre-temps (un
-- collègue l'a annulée, déjà expédiée) ou qui ne vont pas au livreur (un
-- retrait au magasin) sont laissées de côté, et l'écran les nomme.
-- =====================================================================

create function private.numeros_du_lot(p_numeros text[])
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text[];
begin
  select coalesce(array_agg(distinct btrim(n) order by btrim(n)), '{}') into v
    from unnest(coalesce(p_numeros, '{}')) n where nullif(btrim(n), '') is not null;
  if cardinality(v) = 0 then
    raise exception 'Cochez au moins une commande' using errcode = 'check_violation', hint = 'lot';
  end if;
  if cardinality(v) > 200 then
    raise exception 'Au plus 200 commandes d''un coup' using errcode = 'check_violation', hint = 'lot';
  end if;
  return v;
end;
$$;

-- Remettre au livreur : les commandes confirmées, à livrer à domicile, passent expédiées.
create function public.gestion_expedier_lot(p_boutique_id uuid, p_numeros text[], p_transporteur text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_numeros    text[];
  v_numero     text;
  v_commande   public.commandes;
  v_faites     text[] := '{}';
  v_ignorees   text[] := '{}';
  v_transporteur text := nullif(btrim(p_transporteur), '');
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,preparateur}');
  v_numeros := private.numeros_du_lot(p_numeros);
  if char_length(coalesce(v_transporteur, '')) > 80 then
    raise exception 'Le nom du transporteur est trop long' using errcode = 'check_violation', hint = 'motif';
  end if;
  -- Dans l'ordre des numéros : deux lots simultanés verrouillent dans le même ordre.
  foreach v_numero in array v_numeros loop
    select * into v_commande from public.commandes c
     where c.boutique_id = p_boutique_id and c.numero = v_numero
     for update;
    if not found or v_commande.statut <> 'confirmee' or v_commande.mode_livraison <> 'domicile' then
      v_ignorees := v_ignorees || v_numero;
      continue;
    end if;
    update public.commandes
       set statut = 'expediee', transporteur = coalesce(v_transporteur, v_commande.transporteur)
     where boutique_id = p_boutique_id and id = v_commande.id;
    v_faites := v_faites || v_numero;
  end loop;
  return jsonb_build_object('faites', to_jsonb(v_faites), 'ignorees', to_jsonb(v_ignorees));
end;
$$;

-- Le point du livreur : les colis expédiés qu'il a livrés passent livrés, paiement encaissé.
create function public.gestion_livrer_lot(p_boutique_id uuid, p_numeros text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_numeros  text[];
  v_numero   text;
  v_commande public.commandes;
  v_faites   text[] := '{}';
  v_ignorees text[] := '{}';
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,confirmateur,preparateur}');
  v_numeros := private.numeros_du_lot(p_numeros);
  foreach v_numero in array v_numeros loop
    select * into v_commande from public.commandes c
     where c.boutique_id = p_boutique_id and c.numero = v_numero
     for update;
    if not found or v_commande.statut <> 'expediee' or v_commande.mode_livraison <> 'domicile' then
      v_ignorees := v_ignorees || v_numero;
      continue;
    end if;
    update public.commandes
       set statut = 'livree',
           statut_paiement = case when v_commande.mode_paiement = 'cod' then 'paye' else v_commande.statut_paiement end
     where boutique_id = p_boutique_id and id = v_commande.id;
    v_faites := v_faites || v_numero;
  end loop;
  return jsonb_build_object('faites', to_jsonb(v_faites), 'ignorees', to_jsonb(v_ignorees));
end;
$$;

comment on function public.gestion_expedier_lot(uuid, text[], text) is
  'Remettre au livreur d''un geste : les commandes confirmées, à livrer à domicile, passent expédiées (le transporteur nommé) ; les autres sont laissées de côté et nommées.';
comment on function public.gestion_livrer_lot(uuid, text[]) is
  'Le point du livreur d''un geste : les colis expédiés livrés passent livrés, paiement encaissé ; les autres sont laissés de côté et nommés.';

revoke execute on function private.numeros_du_lot(text[]) from public, anon, authenticated;
revoke execute on function public.gestion_expedier_lot(uuid, text[], text) from public, anon;
revoke execute on function public.gestion_livrer_lot(uuid, text[]) from public, anon;
grant  execute on function public.gestion_expedier_lot(uuid, text[], text) to authenticated;
grant  execute on function public.gestion_livrer_lot(uuid, text[]) to authenticated;
