-- =====================================================================
-- SkanEcom — 87 · LES LOTS S'APPELLENT « PACKS » À L'ÉCRAN
-- =====================================================================
--
-- Skander, le 05/10 : chez SkanFact, un « lot » est un numéro de lot et sa
-- date de péremption (sa brique 97) ; un commerçant qui a les deux outils
-- lirait deux choses sous le même mot. Les ensembles vendus à un prix
-- (migration 86) s'appellent donc « packs » partout où on les lit : la
-- vitrine, le backoffice, et les refus de la base que ses écrans montrent.
-- Dans la base et le code, ils restent public.lots (rien ne change pour
-- le chiffrage, les commandes passées ni l'aperçu en ligne).
-- =====================================================================

comment on table public.lots is
  'Les packs d''une boutique (module promotions ; « lots » dans la base) : deux à quatre produits vendus ensemble à un prix. Appliqués par private.chiffre_commande quand le panier les réunit.';

CREATE OR REPLACE FUNCTION public.gestion_enregistrer_lot(p_boutique_id uuid, p_lot_id uuid, p_nom text, p_accroche text, p_produits uuid[], p_prix bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_nom      text := btrim(coalesce(p_nom, ''));
  v_accroche text := nullif(btrim(coalesce(p_accroche, '')), '');
  v_produits uuid[];
  v_valeur   bigint;
  v_avant    jsonb;
  v_lot      public.lots;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  if not private.promotions_actif(p_boutique_id) then
    raise exception 'Les promotions ne sont pas ouvertes pour cette boutique' using errcode = 'check_violation', hint = 'module';
  end if;
  if char_length(v_nom) not between 2 and 60 then
    raise exception 'Le nom du pack : de 2 à 60 caractères' using errcode = 'check_violation', hint = 'nom';
  end if;
  if char_length(v_accroche) > 160 or char_length(v_accroche) < 2 then
    raise exception 'La phrase du pack : de 2 à 160 caractères' using errcode = 'check_violation', hint = 'accroche';
  end if;
  -- Les produits, dans l'ordre choisi, chacun une fois.
  select array_agg(x.id order by x.ordre) into v_produits
    from (select distinct on (u.id) u.id, u.ordre
            from unnest(coalesce(p_produits, '{}')) with ordinality as u(id, ordre)
           where u.id is not null
           order by u.id, u.ordre) x;
  if coalesce(cardinality(v_produits), 0) not between 2 and 4 then
    raise exception 'Un pack réunit de 2 à 4 produits différents' using errcode = 'check_violation', hint = 'produits';
  end if;
  if (select count(*) from public.produits p
       where p.boutique_id = p_boutique_id and p.id = any(v_produits) and p.publie
         and exists (select 1 from public.variantes v where v.boutique_id = p.boutique_id and v.produit_id = p.id and v.actif))
     <> cardinality(v_produits) then
    raise exception 'Chaque produit du pack doit être en vente dans la boutique' using errcode = 'check_violation', hint = 'produits';
  end if;
  select sum(m.prix) into v_valeur
    from unnest(v_produits) as u(id)
    cross join lateral (select min(v.prix_millimes) as prix from public.variantes v
                         where v.boutique_id = p_boutique_id and v.produit_id = u.id and v.actif) m;
  if p_prix is null or p_prix < 1000 then
    raise exception 'Le prix du pack : 1 TND au moins' using errcode = 'check_violation', hint = 'prix';
  end if;
  if p_prix >= v_valeur then
    raise exception 'Le pack doit coûter moins que ses produits achetés un à un (% TND)', private.dinars(v_valeur)
      using errcode = 'check_violation', hint = 'prix_lot';
  end if;

  if p_lot_id is null then
    insert into public.lots (boutique_id, nom, accroche, prix_millimes, cree_par, position)
    values (p_boutique_id, v_nom, v_accroche, p_prix, auth.uid(),
            coalesce((select max(l.position) + 1 from public.lots l where l.boutique_id = p_boutique_id), 0))
    returning * into v_lot;
  else
    select jsonb_build_object('nom', l.nom, 'accroche', l.accroche, 'prix_millimes', l.prix_millimes,
                              'produits', (select jsonb_agg(lp.produit_id order by lp.position)
                                             from public.lot_produits lp
                                            where lp.boutique_id = l.boutique_id and lp.lot_id = l.id))
      into v_avant
      from public.lots l where l.boutique_id = p_boutique_id and l.id = p_lot_id
      for update;
    if v_avant is null then
      raise exception 'Ce pack n''existe pas dans cette boutique' using errcode = 'check_violation', hint = 'introuvable';
    end if;
    update public.lots set nom = v_nom, accroche = v_accroche, prix_millimes = p_prix
     where boutique_id = p_boutique_id and id = p_lot_id
    returning * into v_lot;
    delete from public.lot_produits where boutique_id = p_boutique_id and lot_id = v_lot.id;
  end if;
  insert into public.lot_produits (boutique_id, lot_id, produit_id, position)
  select p_boutique_id, v_lot.id, u.id, u.ordre - 1
    from unnest(v_produits) with ordinality as u(id, ordre);

  perform private.console_trace(auth.uid(), p_boutique_id, case when p_lot_id is null then 'lot.creer' else 'lot.modifier' end,
    v_lot.id::text, v_avant,
    jsonb_build_object('nom', v_lot.nom, 'accroche', v_lot.accroche, 'prix_millimes', v_lot.prix_millimes,
                       'produits', to_jsonb(v_produits)));
  return jsonb_build_object('id', v_lot.id, 'nom', v_lot.nom, 'valeur_millimes', v_valeur);
end;
$function$;

CREATE OR REPLACE FUNCTION public.gestion_geste_lot(p_boutique_id uuid, p_lot_id uuid, p_geste text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lot public.lots;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select l.* into v_lot from public.lots l where l.boutique_id = p_boutique_id and l.id = p_lot_id for update;
  if not found then
    raise exception 'Ce pack n''existe pas dans cette boutique' using errcode = 'check_violation', hint = 'introuvable';
  end if;
  case p_geste
    when 'couper', 'rallumer' then
      if v_lot.actif = (p_geste = 'rallumer') then
        raise exception '%', case when v_lot.actif then 'Ce pack est déjà en vente' else 'Ce pack est déjà coupé' end
          using errcode = 'check_violation', hint = 'etat';
      end if;
      if p_geste = 'rallumer' and not private.promotions_actif(p_boutique_id) then
        raise exception 'Les promotions ne sont pas ouvertes pour cette boutique' using errcode = 'check_violation', hint = 'module';
      end if;
      update public.lots set actif = (p_geste = 'rallumer') where boutique_id = p_boutique_id and id = v_lot.id;
      perform private.console_trace(auth.uid(), p_boutique_id, 'lot.' || p_geste, v_lot.id::text,
        jsonb_build_object('nom', v_lot.nom, 'actif', v_lot.actif), jsonb_build_object('nom', v_lot.nom, 'actif', p_geste = 'rallumer'));
    when 'retirer' then
      delete from public.lots where boutique_id = p_boutique_id and id = v_lot.id;
      perform private.console_trace(auth.uid(), p_boutique_id, 'lot.retirer', v_lot.id::text,
        jsonb_build_object('nom', v_lot.nom, 'prix_millimes', v_lot.prix_millimes), null);
    else
      raise exception 'Geste inconnu' using errcode = 'check_violation', hint = 'geste';
  end case;
  return jsonb_build_object('nom', v_lot.nom, 'geste', p_geste);
end;
$function$;
