-- =====================================================================
-- SkanEcom — 86 · LES LOTS : UN PRIX POUR UN ENSEMBLE (module promotions)
-- =====================================================================
--
-- « La tenue du week-end : la chemise en lin et les mocassins, 359 DT au
-- lieu de 408. » La boutique compose un lot de deux à quatre produits et
-- lui donne un prix ; quand le panier les réunit, la base l'applique
-- d'elle-même au chiffrage (private.chiffre_commande) — le panier, la page
-- de commande, la commande passée, une commande saisie par l'équipe :
--
--   · pour chaque produit du lot, la déclinaison la moins chère du panier
--     (la taille, la couleur : au choix du client) ; autant de fois que le
--     panier réunit le lot entier ;
--   · seulement s'il fait payer moins : un prix pro, une opération de prix
--     barrés déjà plus bas gardent la main ;
--   · jamais sur une pièce au prix par quantité (les remises ne se cumulent
--     pas), jamais sur un devis (son prix est négocié) ;
--   · l'économie se répartit sur les pièces du lot, au prorata de leur prix :
--     chaque ligne dit son lot et ce qu'il lui retire, la commande le garde,
--     la facture SkanFact porte les prix payés ;
--   · un code promo s'applique ensuite, sur ce qui reste ; les frais de
--     livraison se comptent sur ce qui reste aussi.
--
-- Module promotions coupé : aucun lot ne s'applique, rien ne s'efface.
--
-- 1. public.lots, public.lot_produits ; commande_lignes.lot_id, lot_nom,
--    remise_lot_millimes.
-- 2. Le chiffrage : private.chiffre_commande enveloppe le chiffrage d'avant
--    (renommé private.chiffre_sans_lots) et y pose les lots.
-- 3. La vitrine les lit (public.vitrine_lots) ; le backoffice les compose
--    (gestion_lots, gestion_enregistrer_lot, gestion_geste_lot).
-- 4. La commande garde le lot de chaque ligne (passer_commande,
--    gestion_saisir_commande) ; la fiche et le suivi le disent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Les lots
-- ---------------------------------------------------------------------
create table public.lots (
  id            uuid primary key default gen_random_uuid(),
  boutique_id   uuid not null references plateforme.boutiques (id) on delete cascade,
  nom           text not null constraint lots_nom check (char_length(btrim(nom)) between 2 and 60),
  -- Une phrase pour la vitrine : « Pour les soirées d'été ».
  accroche      text constraint lots_accroche check (accroche is null or char_length(btrim(accroche)) between 2 and 160),
  prix_millimes bigint not null constraint lots_prix check (prix_millimes between 1000 and 100000000),
  actif         boolean not null default true,
  position      integer not null default 0,
  created_at    timestamptz not null default now(),
  cree_par      uuid references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now(),
  unique (boutique_id, id)
);

comment on table public.lots is
  'Les lots d''une boutique (module promotions) : deux à quatre produits vendus ensemble à un prix. Appliqués par private.chiffre_commande quand le panier les réunit.';

create table public.lot_produits (
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  lot_id      uuid not null,
  produit_id  uuid not null,
  position    smallint not null default 0,
  primary key (boutique_id, lot_id, produit_id),
  foreign key (boutique_id, lot_id) references public.lots (boutique_id, id) on delete cascade,
  foreign key (boutique_id, produit_id) references public.produits (boutique_id, id) on delete cascade
);
create index lot_produits_produit_idx on public.lot_produits (boutique_id, produit_id);

create trigger lots_updated_at
  before update on public.lots
  for each row execute function private.set_updated_at();
create trigger lots_boutique_immuable
  before update of boutique_id on public.lots
  for each row execute function private.boutique_immuable();
create trigger lot_produits_boutique_immuable
  before update of boutique_id on public.lot_produits
  for each row execute function private.boutique_immuable();

-- La vitrine les lit par public.vitrine_lots (un visiteur ne voit aucune
-- ligne) ; l'équipe lit ceux de sa boutique ; personne n'écrit par l'API.
alter table public.lots enable row level security;
alter table public.lot_produits enable row level security;
create policy "lots: l'équipe lit ceux de sa boutique"
  on public.lots for select using (boutique_id in (select private.mes_boutiques()));
create policy "lot_produits: l'équipe lit ceux de sa boutique"
  on public.lot_produits for select using (boutique_id in (select private.mes_boutiques()));
revoke insert, update, delete, truncate on public.lots, public.lot_produits from anon, authenticated;
grant select on public.lots, public.lot_produits to anon, authenticated;

-- La commande garde le lot de chaque ligne : son nom figé, ce qu'il retire.
alter table public.commande_lignes
  add column lot_id uuid,
  add column lot_nom text,
  add column remise_lot_millimes bigint not null default 0 constraint commande_lignes_remise_lot check (remise_lot_millimes >= 0),
  add constraint commande_lignes_lot_fk foreign key (boutique_id, lot_id)
    references public.lots (boutique_id, id) on delete set null (lot_id);

comment on column public.commande_lignes.lot_nom is
  'Le lot qui a baissé cette ligne, son nom figé (le lot peut changer ou disparaître) ; remise_lot_millimes : ce qu''il lui a retiré.';


-- ---------------------------------------------------------------------
-- 2. Le chiffrage : les lots du panier
-- ---------------------------------------------------------------------
alter function private.chiffre_commande(uuid, jsonb, text, boolean) rename to chiffre_sans_lots;

comment on function private.chiffre_sans_lots(uuid, jsonb, text, boolean) is
  'Le chiffrage d''un panier sans les lots (prix publics, pro, devis, paliers, livraison). Appelé par private.chiffre_commande, qui y pose les lots.';

create function private.chiffre_commande(p_boutique_id uuid, p_lignes jsonb, p_gouvernorat text, p_retrait boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v          jsonb := private.chiffre_sans_lots(p_boutique_id, p_lignes, p_gouvernorat, p_retrait);
  v_lignes   jsonb := coalesce(v -> 'lignes', '[]'::jsonb);
  n          integer := jsonb_array_length(coalesce(v -> 'lignes', '[]'::jsonb));
  v_l        jsonb;
  v_slug     text[];
  v_prix     bigint[];
  v_reste    integer[];
  v_remise   bigint[];
  v_lot_id   uuid[];
  v_lot_nom  text[];
  v_lot      record;
  v_s        text;
  v_choix    integer[];
  v_complet  boolean;
  v_somme    bigint;
  v_eco      bigint;
  v_part     bigint;
  v_cumul    bigint;
  v_haut     integer;
  v_fois     integer;
  v_eco_lot  bigint;
  v_lots     jsonb := '[]'::jsonb;
  v_total    bigint := 0;
  v_sortie   jsonb := '[]'::jsonb;
  v_sous     bigint;
  v_frais    bigint;
  v_supp     bigint;
  i          integer;
  j          integer;
  k          integer;
begin
  if v ->> 'tarif' = 'devis' or n = 0 or not private.promotions_actif(p_boutique_id) then
    return v || jsonb_build_object('lots', '[]'::jsonb, 'economie_lots_millimes', null);
  end if;

  -- Les pièces qui peuvent entrer dans un lot : en vente, sans prix par quantité.
  for i in 1 .. n loop
    v_l := v_lignes -> (i - 1);
    v_slug[i]   := v_l ->> 'produit_slug';
    v_prix[i]   := (v_l ->> 'prix_unitaire_millimes')::bigint;
    v_reste[i]  := case when v_l ->> 'produit_slug' is not null and v_l ->> 'palier' is null
                         and v_l ->> 'total_ligne_millimes' is not null
                        then (v_l ->> 'quantite')::integer else 0 end;
    v_remise[i] := 0;
  end loop;

  -- Les lots actifs dont le panier a chaque produit, dans l'ordre de la boutique.
  for v_lot in
    select l.id, l.nom, l.prix_millimes, array_agg(p.slug order by lp.position, p.slug) as slugs
      from public.lots l
      join public.lot_produits lp on lp.boutique_id = l.boutique_id and lp.lot_id = l.id
      join public.produits p on p.boutique_id = lp.boutique_id and p.id = lp.produit_id
     where l.boutique_id = p_boutique_id and l.actif
     group by l.id
    having count(*) between 2 and 4 and bool_and(p.publie) and array_agg(p.slug) <@ v_slug
     order by l.position, l.created_at, l.id
  loop
    v_fois := 0;
    v_eco_lot := 0;
    loop
      -- Un lot de plus : la déclinaison la moins chère qui reste, pour chaque produit.
      v_choix := '{}';
      v_somme := 0;
      v_complet := true;
      foreach v_s in array v_lot.slugs loop
        k := null;
        for j in 1 .. n loop
          if v_reste[j] > 0 and v_slug[j] = v_s and (k is null or v_prix[j] < v_prix[k]) then
            k := j;
          end if;
        end loop;
        if k is null then
          v_complet := false;
          exit;
        end if;
        v_choix := v_choix || k;
        v_somme := v_somme + v_prix[k];
        v_reste[k] := v_reste[k] - 1;
      end loop;
      if not v_complet then
        foreach k in array v_choix loop
          v_reste[k] := v_reste[k] + 1;
        end loop;
        exit;
      end if;

      v_eco := v_somme - v_lot.prix_millimes;
      if v_eco > 0 then
        -- L'économie, au prorata du prix de chaque pièce ; l'arrondi va à la plus chère.
        v_cumul := 0;
        v_haut := 1;
        for j in 1 .. cardinality(v_choix) loop
          k := v_choix[j];
          v_part := (v_eco * v_prix[k]) / v_somme;
          v_cumul := v_cumul + v_part;
          v_remise[k] := v_remise[k] + v_part;
          if v_prix[k] > v_prix[v_choix[v_haut]] then
            v_haut := j;
          end if;
          if v_lot_id[k] is null then
            v_lot_id[k] := v_lot.id;
            v_lot_nom[k] := v_lot.nom;
          end if;
        end loop;
        v_remise[v_choix[v_haut]] := v_remise[v_choix[v_haut]] + (v_eco - v_cumul);
        v_fois := v_fois + 1;
        v_eco_lot := v_eco_lot + v_eco;
      end if;
    end loop;

    if v_fois > 0 then
      v_lots := v_lots || jsonb_build_array(jsonb_build_object(
        'id', v_lot.id, 'nom', v_lot.nom, 'prix_millimes', v_lot.prix_millimes,
        'fois', v_fois, 'economie_millimes', v_eco_lot));
      v_total := v_total + v_eco_lot;
    end if;
  end loop;

  if v_total = 0 then
    return v || jsonb_build_object('lots', '[]'::jsonb, 'economie_lots_millimes', null);
  end if;

  for i in 1 .. n loop
    v_l := v_lignes -> (i - 1);
    if v_remise[i] > 0 then
      v_l := v_l || jsonb_build_object(
        'lot_id',                  v_lot_id[i],
        'lot',                     v_lot_nom[i],
        'remise_lot_millimes',     v_remise[i],
        'total_sans_lot_millimes', (v_l ->> 'total_ligne_millimes')::bigint,
        'total_ligne_millimes',    (v_l ->> 'total_ligne_millimes')::bigint - v_remise[i],
        'prix_unitaire_millimes',  round(((v_l ->> 'total_ligne_millimes')::bigint - v_remise[i])::numeric
                                         / (v_l ->> 'quantite')::integer)::bigint);
    end if;
    v_sortie := v_sortie || jsonb_build_array(v_l);
  end loop;

  -- Les frais se comptent sur ce que le client paie : sous le seuil de la
  -- livraison offerte, le lot la fait payer.
  v_sous  := (v ->> 'sous_total_millimes')::bigint - v_total;
  v_frais := (v ->> 'frais_livraison_millimes')::bigint;
  v_supp  := (v ->> 'supplement_poids_millimes')::bigint;
  if not coalesce(p_retrait, false) and v #>> '{gouvernorat,code}' is not null then
    v_frais := public.frais_livraison_millimes(p_boutique_id, v #>> '{gouvernorat,code}', v_sous, (v ->> 'poids_grammes')::integer);
    v_supp  := case when v_frais > 0 then private.supplement_poids(p_boutique_id, (v ->> 'poids_grammes')::integer) else 0 end;
  end if;

  return v || jsonb_build_object(
    'lignes',                    v_sortie,
    'sous_total_millimes',       v_sous,
    'frais_livraison_millimes',  v_frais,
    'supplement_poids_millimes', v_supp,
    'total_millimes',            v_sous + v_frais,
    'lots',                      v_lots,
    'economie_lots_millimes',    v_total);
end;
$$;

comment on function private.chiffre_commande(uuid, jsonb, text, boolean) is
  'Le chiffrage d''un panier (private.chiffre_sans_lots) avec ses lots : chaque ligne d''un lot dit son lot (lot, lot_id, remise_lot_millimes, total_sans_lot_millimes) ; lots : ceux appliqués (fois, economie_millimes) ; economie_lots_millimes.';

revoke execute on function private.chiffre_sans_lots(uuid, jsonb, text, boolean) from public, anon, authenticated;
revoke execute on function private.chiffre_commande(uuid, jsonb, text, boolean) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. La vitrine les lit
-- ---------------------------------------------------------------------
-- Les lots en vente qui comptent l'un des produits demandés (la fiche : le
-- sien ; le tiroir : ceux du panier), chacun avec ses produits et leurs
-- déclinaisons en vente, de quoi choisir la taille et l'ajouter d'un geste.
create function public.vitrine_lots(p_boutique_id uuid, p_slugs text[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with lots as (
    select l.id, l.nom, l.accroche, l.prix_millimes, l.position, l.created_at
      from public.lots l
      join public.lot_produits lp on lp.boutique_id = l.boutique_id and lp.lot_id = l.id
      join public.produits p on p.boutique_id = lp.boutique_id and p.id = lp.produit_id
     where l.boutique_id = p_boutique_id and l.actif
       and private.promotions_actif(p_boutique_id)
       and exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active')
     group by l.id
    having count(*) between 2 and 4
       and bool_and(p.publie and exists (select 1 from public.variantes v
                                          where v.boutique_id = p.boutique_id and v.produit_id = p.id and v.actif))
       and bool_or(p.slug = any(coalesce(p_slugs[1:50], '{}')))
  ), pieces as (
    select lp.lot_id, lp.position, p.slug,
           jsonb_build_object(
             'id', p.id,
             'slug', p.slug,
             'nom', coalesce(p.nom_fr, p.nom_ar),
             'image', (select i.chemin from public.produit_images i
                        where i.boutique_id = p.boutique_id and i.produit_id = p.id
                        order by (i.variante_id is null) desc, i.position, i.created_at limit 1),
             'prix_min_millimes', (select min(v.prix_millimes) from public.variantes v
                                    where v.boutique_id = p.boutique_id and v.produit_id = p.id and v.actif),
             'variantes', (select jsonb_agg(jsonb_build_object(
                                    'id', v.id, 'sku', v.sku, 'prix_millimes', v.prix_millimes,
                                    'stock', v.stock, 'quantite_min', v.quantite_min, 'image', v.image_chemin,
                                    'libelle', (select string_agg(v.options ->> o.cle, ' · ' order by o.position, o.cle)
                                                  from public.produit_options o
                                                 where o.boutique_id = v.boutique_id and o.produit_id = v.produit_id
                                                   and v.options ? o.cle))
                                  order by v.position, v.sku)
                             from public.variantes v
                            where v.boutique_id = p.boutique_id and v.produit_id = p.id and v.actif)) as piece
      from public.lot_produits lp
      join public.produits p on p.boutique_id = lp.boutique_id and p.id = lp.produit_id
     where lp.boutique_id = p_boutique_id and lp.lot_id in (select id from lots)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'nom', l.nom, 'accroche', l.accroche, 'prix_millimes', l.prix_millimes,
           'valeur_millimes', (select sum((x.piece ->> 'prix_min_millimes')::bigint) from pieces x where x.lot_id = l.id),
           'produits', (select jsonb_agg(x.piece order by x.position, x.slug) from pieces x where x.lot_id = l.id))
         order by l.position, l.created_at, l.id), '[]'::jsonb)
    from lots l
$$;

comment on function public.vitrine_lots(uuid, text[]) is
  'Les lots en vente d''une boutique active (module promotions) qui comptent l''un des produits demandés, avec leurs produits et déclinaisons en vente ; valeur_millimes : les produits au plus bas, achetés un à un.';

revoke execute on function public.vitrine_lots(uuid, text[]) from public;
grant  execute on function public.vitrine_lots(uuid, text[]) to anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 3 bis. Le backoffice les compose
-- ---------------------------------------------------------------------
-- L'écran des lots : chacun avec ses produits, sa valeur (les produits au
-- plus bas), son économie, ses ventes ; et le catalogue pour en composer.
create function public.gestion_lots(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', private.promotions_actif(p_boutique_id),
    'lots', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'nom', l.nom, 'accroche', l.accroche, 'prix_millimes', l.prix_millimes, 'actif', l.actif,
               'cree_le', l.created_at,
               'produits', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', p.id, 'slug', p.slug, 'nom', coalesce(p.nom_fr, p.nom_ar), 'publie', p.publie,
                          'prix_min_millimes', (select min(v.prix_millimes) from public.variantes v
                                                 where v.boutique_id = p.boutique_id and v.produit_id = p.id and v.actif),
                          'image', (select i.chemin from public.produit_images i
                                     where i.boutique_id = p.boutique_id and i.produit_id = p.id
                                     order by (i.variante_id is null) desc, i.position, i.created_at limit 1))
                        order by lp.position, p.slug)
                   from public.lot_produits lp
                   join public.produits p on p.boutique_id = lp.boutique_id and p.id = lp.produit_id
                  where lp.boutique_id = l.boutique_id and lp.lot_id = l.id), '[]'::jsonb),
               -- Ses ventes : les commandes (sauf annulées) dont une ligne l'a pris.
               'commandes', (select count(distinct cl.commande_id)::integer
                               from public.commande_lignes cl
                               join public.commandes c on c.boutique_id = cl.boutique_id and c.id = cl.commande_id
                              where cl.boutique_id = l.boutique_id and cl.lot_id = l.id and c.statut <> 'annulee'),
               'remises_millimes', (select coalesce(sum(cl.remise_lot_millimes), 0)
                                      from public.commande_lignes cl
                                      join public.commandes c on c.boutique_id = cl.boutique_id and c.id = cl.commande_id
                                     where cl.boutique_id = l.boutique_id and cl.lot_id = l.id and c.statut <> 'annulee'))
             order by l.actif desc, l.position, l.created_at, l.id)
        from public.lots l where l.boutique_id = p_boutique_id), '[]'::jsonb),
    'produits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'nom', coalesce(p.nom_fr, p.nom_ar), 'rayon', coalesce(c.nom_fr, c.nom_ar),
               'prix_min_millimes', m.prix)
             order by coalesce(c.nom_fr, c.nom_ar) nulls last, coalesce(p.nom_fr, p.nom_ar), p.id)
        from public.produits p
        left join public.categories c on c.boutique_id = p.boutique_id and c.id = p.categorie_id
        cross join lateral (select min(v.prix_millimes) as prix from public.variantes v
                             where v.boutique_id = p.boutique_id and v.produit_id = p.id and v.actif) m
       where p.boutique_id = p_boutique_id and p.publie and m.prix is not null), '[]'::jsonb));
end;
$$;

-- Composer ou changer un lot : son nom, sa phrase, ses deux à quatre
-- produits (en vente, chacun une fois), son prix — moins que ses produits
-- achetés un à un, au plus bas.
create function public.gestion_enregistrer_lot(
  p_boutique_id uuid,
  p_lot_id      uuid,
  p_nom         text,
  p_accroche    text,
  p_produits    uuid[],
  p_prix        bigint
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
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
    raise exception 'Le nom du lot : de 2 à 60 caractères' using errcode = 'check_violation', hint = 'nom';
  end if;
  if char_length(v_accroche) > 160 or char_length(v_accroche) < 2 then
    raise exception 'La phrase du lot : de 2 à 160 caractères' using errcode = 'check_violation', hint = 'accroche';
  end if;
  -- Les produits, dans l'ordre choisi, chacun une fois.
  select array_agg(x.id order by x.ordre) into v_produits
    from (select distinct on (u.id) u.id, u.ordre
            from unnest(coalesce(p_produits, '{}')) with ordinality as u(id, ordre)
           where u.id is not null
           order by u.id, u.ordre) x;
  if coalesce(cardinality(v_produits), 0) not between 2 and 4 then
    raise exception 'Un lot réunit de 2 à 4 produits différents' using errcode = 'check_violation', hint = 'produits';
  end if;
  if (select count(*) from public.produits p
       where p.boutique_id = p_boutique_id and p.id = any(v_produits) and p.publie
         and exists (select 1 from public.variantes v where v.boutique_id = p.boutique_id and v.produit_id = p.id and v.actif))
     <> cardinality(v_produits) then
    raise exception 'Chaque produit du lot doit être en vente dans la boutique' using errcode = 'check_violation', hint = 'produits';
  end if;
  select sum(m.prix) into v_valeur
    from unnest(v_produits) as u(id)
    cross join lateral (select min(v.prix_millimes) as prix from public.variantes v
                         where v.boutique_id = p_boutique_id and v.produit_id = u.id and v.actif) m;
  if p_prix is null or p_prix < 1000 then
    raise exception 'Le prix du lot : 1 TND au moins' using errcode = 'check_violation', hint = 'prix';
  end if;
  if p_prix >= v_valeur then
    raise exception 'Le lot doit coûter moins que ses produits achetés un à un (% TND)', private.dinars(v_valeur)
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
      raise exception 'Ce lot n''existe pas dans cette boutique' using errcode = 'check_violation', hint = 'introuvable';
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
$$;

-- Couper (la vitrine ne le propose plus, le panier ne l'applique plus),
-- rallumer, retirer (les commandes passées gardent son nom).
create function public.gestion_geste_lot(p_boutique_id uuid, p_lot_id uuid, p_geste text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lot public.lots;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin}');
  select l.* into v_lot from public.lots l where l.boutique_id = p_boutique_id and l.id = p_lot_id for update;
  if not found then
    raise exception 'Ce lot n''existe pas dans cette boutique' using errcode = 'check_violation', hint = 'introuvable';
  end if;
  case p_geste
    when 'couper', 'rallumer' then
      if v_lot.actif = (p_geste = 'rallumer') then
        raise exception '%', case when v_lot.actif then 'Ce lot est déjà en vente' else 'Ce lot est déjà coupé' end
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
$$;

-- La navigation du backoffice : le module, ses codes, ses opérations, ses lots.
create or replace function public.gestion_promotions_etat(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', private.promotions_actif(p_boutique_id),
    'codes', (select count(*) from public.codes_promo c where c.boutique_id = p_boutique_id),
    'soldes', (select count(*) from public.soldes s where s.boutique_id = p_boutique_id),
    'soldes_en_cours', (select count(*) from public.soldes s where s.boutique_id = p_boutique_id and s.statut = 'en_cours'),
    'lots', (select count(*) from public.lots l where l.boutique_id = p_boutique_id));
end;
$$;

revoke execute on function public.gestion_lots(uuid) from public, anon;
revoke execute on function public.gestion_enregistrer_lot(uuid, uuid, text, text, uuid[], bigint) from public, anon;
revoke execute on function public.gestion_geste_lot(uuid, uuid, text) from public, anon;
grant  execute on function public.gestion_lots(uuid) to authenticated;
grant  execute on function public.gestion_enregistrer_lot(uuid, uuid, text, text, uuid[], bigint) to authenticated;
grant  execute on function public.gestion_geste_lot(uuid, uuid, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. La commande garde le lot de chaque ligne ; la fiche et le suivi le disent
--    (fonctions reprises des migrations 45, 83 et 84 : seules les lignes changent)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.passer_commande(p_boutique_id uuid, p_cle_idempotence text, p_lignes jsonb, p_contact jsonb, p_livraison jsonb, p_total_attendu_millimes bigint, p_note text DEFAULT NULL::text, p_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid       uuid := auth.uid();
  v_contact   jsonb := case when jsonb_typeof(p_contact) = 'object' then p_contact else '{}'::jsonb end;
  v_adresse   jsonb := case when jsonb_typeof(p_livraison) = 'object' then p_livraison else '{}'::jsonb end;
  v_nom       text;
  v_tel       text;
  v_email     text;
  v_ligne1    text;
  v_ligne2    text;
  v_ville     text;
  v_gouv      text;
  v_cp        text;
  v_mode      text;
  v_note      text := nullif(btrim(p_note), '');
  v_systeme   text := current_setting('skanecom.geste_systeme', true);
  v_existante public.commandes;
  v_client    public.clients;
  v_max       integer;
  v_devis     jsonb;
  v_commande  public.commandes;
  v_jeton     text := private.nouveau_jeton();
  v_code_id   uuid;
begin
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active') then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found', hint = 'boutique';
  end if;
  if p_cle_idempotence is null or p_cle_idempotence !~ '^[A-Za-z0-9-]{16,100}$' then
    raise exception 'Clé d''idempotence invalide' using errcode = 'check_violation', hint = 'cle';
  end if;

  v_tel := private.telephone_tunisien(v_contact ->> 'telephone');
  if v_tel is null then
    raise exception 'Numéro de téléphone tunisien attendu (8 chiffres)' using errcode = 'check_violation', hint = 'contact';
  end if;

  -- Une commande à la fois par boutique et par numéro : deux envois
  -- simultanés de la même commande ne se croisent pas, et la limite des
  -- commandes en attente tient sous la concurrence.
  perform pg_advisory_xact_lock(hashtextextended('commande:' || p_boutique_id::text || ':' || v_tel, 0));

  -- Rejeu (double clic, réseau coupé pendant la réponse) : la même clé rend
  -- la même commande, avec un nouveau jeton de suivi.
  select * into v_existante from public.commandes c
   where c.boutique_id = p_boutique_id and c.cle_idempotence = p_cle_idempotence;
  if found then
    if v_existante.contact_telephone is distinct from v_tel then
      raise exception 'Cette clé appartient à une autre commande' using errcode = 'unique_violation', hint = 'cle';
    end if;
    update public.commandes set jeton_suivi_hash = sha256(convert_to(v_jeton, 'UTF8'))
     where boutique_id = p_boutique_id and id = v_existante.id;
    return jsonb_build_object('numero', v_existante.numero, 'jeton', v_jeton, 'statut', v_existante.statut,
                              'total_millimes', v_existante.total_millimes, 'rejouee', true);
  end if;

  -- Contact et adresse
  v_nom    := nullif(btrim(v_contact ->> 'nom'), '');
  v_email  := nullif(lower(btrim(v_contact ->> 'email')), '');
  v_ligne1 := nullif(btrim(v_adresse ->> 'ligne1'), '');
  v_ligne2 := nullif(btrim(v_adresse ->> 'ligne2'), '');
  v_ville  := nullif(btrim(v_adresse ->> 'ville'), '');
  v_gouv   := nullif(btrim(v_adresse ->> 'gouvernorat'), '');
  v_cp     := nullif(btrim(v_adresse ->> 'code_postal'), '');

  if v_nom is null or char_length(v_nom) not between 2 and 80 then
    raise exception 'Indiquez le nom du destinataire' using errcode = 'check_violation', hint = 'contact';
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Adresse e-mail illisible' using errcode = 'check_violation', hint = 'contact';
  end if;
  -- Livraison à domicile (une adresse), ou retrait en magasin (aucune :
  -- l'acheteur vient au magasin ; le chiffrage vérifie que la boutique le
  -- propose).
  v_mode := coalesce(nullif(btrim(v_adresse ->> 'mode'), ''), 'domicile');
  if v_mode not in ('domicile', 'retrait') then
    raise exception 'Mode de livraison inconnu' using errcode = 'check_violation', hint = 'adresse';
  end if;
  if v_mode = 'retrait' then
    v_ligne1 := null; v_ligne2 := null; v_ville := null; v_gouv := null; v_cp := null;
  else
    if v_ligne1 is null or char_length(v_ligne1) not between 3 and 200 or char_length(coalesce(v_ligne2, '')) > 200 then
      raise exception 'Indiquez l''adresse de livraison' using errcode = 'check_violation', hint = 'adresse';
    end if;
    if v_ville is null or char_length(v_ville) not between 2 and 80 then
      raise exception 'Indiquez la ville ou la délégation' using errcode = 'check_violation', hint = 'adresse';
    end if;
    if v_gouv is null then
      raise exception 'Choisissez le gouvernorat' using errcode = 'check_violation', hint = 'adresse';
    end if;
    if v_cp is not null and v_cp !~ '^[0-9]{4}$' then
      raise exception 'Le code postal compte 4 chiffres' using errcode = 'check_violation', hint = 'adresse';
    end if;
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'La note compte 500 caractères au plus' using errcode = 'check_violation', hint = 'contact';
  end if;

  -- Paiement : à la livraison (Konnect arrivera avec le module paiement_en_ligne).
  if not coalesce((private.reglage(p_boutique_id, 'paiement.cod_actif'))::boolean, true) then
    raise exception 'Aucun mode de paiement n''est ouvert dans cette boutique' using errcode = 'check_violation', hint = 'paiement';
  end if;

  -- Compte obligatoire (réglage, oui par défaut) ou commande en invité.
  if v_uid is null and coalesce((private.reglage(p_boutique_id, 'compte.obligatoire'))::boolean, true) then
    raise exception 'Connectez-vous pour commander' using errcode = 'insufficient_privilege', hint = 'compte';
  end if;

  -- L'accord explicite de l'acheteur (migration 15).
  if (v_contact -> 'accepte_conditions') is distinct from 'true'::jsonb then
    raise exception 'Acceptez les conditions de vente et la politique de confidentialité pour commander'
      using errcode = 'check_violation', hint = 'conditions';
  end if;

  perform set_config('skanecom.geste_systeme', 'on', true);

  -- La fiche client de la boutique : celle du compte, ou celle du numéro
  -- pour un invité (la boutique voit l'historique d'un numéro, pas celui
  -- d'une personne qu'elle ne connaît pas).
  if v_uid is not null then
    insert into public.clients as c (boutique_id, user_id, nom, telephone, email)
    values (p_boutique_id, v_uid, v_nom,
            coalesce(private.telephone_tunisien((select u.phone from auth.users u where u.id = v_uid)), v_tel),
            v_email)
    on conflict (boutique_id, user_id) do update
      set nom = coalesce(c.nom, excluded.nom), email = coalesce(c.email, excluded.email)
    returning c.* into v_client;
  else
    select * into v_client from public.clients c
     where c.boutique_id = p_boutique_id and c.user_id is null and c.telephone = v_tel
     order by c.created_at
     limit 1;
    if not found then
      insert into public.clients (boutique_id, nom, telephone, email)
      values (p_boutique_id, v_nom, v_tel, v_email)
      returning * into v_client;
    end if;
  end if;

  if v_client.niveau_risque = 'bloque' or exists (
    select 1 from public.clients c
    where c.boutique_id = p_boutique_id and c.telephone = v_tel and c.niveau_risque = 'bloque'
  ) then
    raise exception 'Ce numéro ne peut pas commander en ligne : contactez la boutique'
      using errcode = 'insufficient_privilege', hint = 'bloque';
  end if;

  v_max := greatest(0, coalesce((private.reglage(p_boutique_id, 'commande.max_en_attente') #>> '{}')::integer, 3));
  if v_max > 0 and (
    select count(*) from public.commandes c
    where c.boutique_id = p_boutique_id and c.statut in ('a_arbitrer', 'recue')
      and (c.contact_telephone = v_tel or c.client_id = v_client.id)
  ) >= v_max then
    raise exception 'Ce numéro a déjà % commandes en attente de confirmation', v_max
      using errcode = 'check_violation', hint = 'en_attente';
  end if;

  -- Les variantes, verrouillées dans un ordre stable (pas d'interblocage
  -- entre deux paniers), puis le chiffrage sur l'état verrouillé.
  perform 1 from public.variantes v
   where v.boutique_id = p_boutique_id
     and v.id in (select d.variante_id from private.lignes_panier(p_lignes) d)
   order by v.id
   for update;

  -- Le code promo (module promotions), verrouillé le temps de compter ses
  -- utilisations : deux commandes simultanées ne dépassent pas sa limite.
  if private.code_saisi(p_code) is not null then
    select c.id into v_code_id from public.codes_promo c
     where c.boutique_id = p_boutique_id and c.code = private.code_saisi(p_code);
    if v_code_id is not null then
      perform pg_advisory_xact_lock(hashtextextended('code_promo:' || v_code_id::text, 0));
    end if;
  end if;

  v_devis := private.applique_code(p_boutique_id,
               private.chiffre_commande(p_boutique_id, p_lignes, v_gouv, v_mode = 'retrait'),
               p_code, v_client.id, v_tel);

  if not (v_devis ->> 'complet')::boolean then
    raise exception 'Un article n''est plus disponible dans la quantité demandée'
      using errcode = 'check_violation', hint = 'stock', detail = (v_devis -> 'lignes')::text;
  end if;
  -- Un code que l'acheteur a vu appliqué et qui ne l'est plus (sa limite
  -- atteinte entre-temps, déjà servi pour ce numéro) : on le lui dit, plutôt
  -- que « le total a changé ». Vu refusé, il commande sans lui.
  if jsonb_typeof(v_devis -> 'code') = 'object' and not (v_devis #>> '{code,applique}')::boolean
     and p_total_attendu_millimes is distinct from (v_devis ->> 'total_millimes')::bigint then
    raise exception '%', private.message_code(v_devis -> 'code')
      using errcode = 'check_violation', hint = 'code', detail = (v_devis -> 'code')::text;
  end if;
  if p_total_attendu_millimes is distinct from (v_devis ->> 'total_millimes')::bigint then
    raise exception 'Le total a changé : % millimes', v_devis ->> 'total_millimes'
      using errcode = 'check_violation', hint = 'total', detail = v_devis::text;
  end if;

  insert into public.commandes (
    boutique_id, cle_idempotence, origine, client_id, statut, mode_paiement, statut_paiement, mode_livraison,
    contact_nom, contact_telephone, contact_email,
    livraison_ligne1, livraison_ligne2, livraison_ville, livraison_gouvernorat, livraison_code_postal, livraison_zone_nom,
    sous_total_millimes, frais_livraison_millimes, remise_millimes, total_millimes, code_promo_id, code_promo,
    transporteur, note_client, jeton_suivi_hash, conditions_acceptees)
  values (
    p_boutique_id, p_cle_idempotence, 'vitrine', v_client.id, 'recue', 'cod', 'en_attente', v_mode,
    v_nom, v_tel, v_email,
    v_ligne1, v_ligne2, v_ville, v_gouv, v_cp, coalesce(v_devis -> 'zone' ->> 'nom_fr', v_devis -> 'zone' ->> 'nom_ar'),
    (v_devis ->> 'sous_total_millimes')::bigint, (v_devis ->> 'frais_livraison_millimes')::bigint,
    (v_devis ->> 'remise_millimes')::bigint, (v_devis ->> 'total_millimes')::bigint,
    case when (v_devis #>> '{code,applique}')::boolean then v_code_id end,
    case when (v_devis #>> '{code,applique}')::boolean then v_devis #>> '{code,code}' end,
    case when v_mode = 'domicile' then nullif(btrim(private.reglage(p_boutique_id, 'livraison.transporteur') #>> '{}'), '') end, v_note,
    sha256(convert_to(v_jeton, 'UTF8')),
    jsonb_build_object('le', now(), 'modele', private.modele_legal(),
                       'retractation_jours', (private.reglage(p_boutique_id, 'legal.retractation_jours') #>> '{}')::integer,
                       'retour_frais', private.reglage(p_boutique_id, 'legal.retour_frais') #>> '{}'))
  returning * into v_commande;

  -- Les lignes figent nom, libellé, référence et prix ; le trigger réserve
  -- le stock (déjà verrouillé : il ne peut plus manquer).
  insert into public.commande_lignes
    (boutique_id, commande_id, variante_id, produit_nom, variante_libelle, sku,
     prix_unitaire_millimes, quantite, total_ligne_millimes, lot_id, lot_nom, remise_lot_millimes)
  select p_boutique_id, v_commande.id, (l ->> 'variante_id')::uuid, l ->> 'produit_nom', l ->> 'variante_libelle',
         l ->> 'sku', (l ->> 'prix_unitaire_millimes')::bigint, (l ->> 'quantite')::integer,
         (l ->> 'total_ligne_millimes')::bigint, (l ->> 'lot_id')::uuid, l ->> 'lot',
         coalesce((l ->> 'remise_lot_millimes')::bigint, 0)
  from jsonb_array_elements(v_devis -> 'lignes') l;

  -- Le carnet d'adresses du compte : la prochaine commande la propose.
  if v_uid is not null and v_mode = 'domicile' and not exists (
    select 1 from public.adresses a
    where a.boutique_id = p_boutique_id and a.client_id = v_client.id
      and a.ligne1 = v_ligne1 and a.ville = v_ville and a.gouvernorat_code = v_gouv
  ) then
    insert into public.adresses (boutique_id, client_id, nom_destinataire, telephone, ligne1, ligne2, ville,
                                 gouvernorat_code, code_postal, par_defaut)
    values (p_boutique_id, v_client.id, v_nom, v_tel, v_ligne1, v_ligne2, v_ville, v_gouv, v_cp,
            not exists (select 1 from public.adresses a
                        where a.boutique_id = p_boutique_id and a.client_id = v_client.id and a.par_defaut));
  end if;

  -- Confirmation automatique (réglage) : la commande passe seule en confirmée.
  if private.reglage(p_boutique_id, 'commande.mode_confirmation') #>> '{}' = 'automatique' then
    update public.commandes set statut = 'confirmee'
     where boutique_id = p_boutique_id and id = v_commande.id
    returning * into v_commande;
  end if;

  perform set_config('skanecom.geste_systeme', coalesce(v_systeme, ''), true);

  return jsonb_build_object('numero', v_commande.numero, 'jeton', v_jeton, 'statut', v_commande.statut,
                            'total_millimes', v_commande.total_millimes, 'rejouee', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.gestion_saisir_commande(p_boutique_id uuid, p_cle_idempotence text, p_canal text, p_client jsonb, p_lignes jsonb, p_livraison jsonb, p_ajustements jsonb, p_confirmee boolean, p_note text, p_total_attendu_millimes bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_contact   jsonb := case when jsonb_typeof(p_client) = 'object' then p_client else '{}'::jsonb end;
  v_adresse   jsonb := case when jsonb_typeof(p_livraison) = 'object' then p_livraison else '{}'::jsonb end;
  v_tel       text;
  v_nom       text := nullif(btrim(v_contact ->> 'nom'), '');
  v_email     text := nullif(lower(btrim(v_contact ->> 'email')), '');
  v_mode      text := coalesce(nullif(btrim(v_adresse ->> 'mode'), ''), 'domicile');
  v_ligne1    text := nullif(btrim(v_adresse ->> 'ligne1'), '');
  v_ligne2    text := nullif(btrim(v_adresse ->> 'ligne2'), '');
  v_ville     text := nullif(btrim(v_adresse ->> 'ville'), '');
  v_gouv      text := nullif(btrim(v_adresse ->> 'gouvernorat'), '');
  v_cp        text := nullif(btrim(v_adresse ->> 'code_postal'), '');
  v_note      text := nullif(btrim(p_note), '');
  v_existante public.commandes;
  v_client    public.clients;
  v_devis     jsonb;
  v_commande  public.commandes;
begin
  perform private.catalogue_exige(p_boutique_id, private.saisie_roles());
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active') then
    raise exception 'Boutique introuvable' using errcode = 'no_data_found', hint = 'boutique';
  end if;
  if p_cle_idempotence is null or p_cle_idempotence !~ '^[A-Za-z0-9-]{16,100}$' then
    raise exception 'Clé d''idempotence invalide' using errcode = 'check_violation', hint = 'cle';
  end if;

  -- Deux envois de la même saisie (double clic, réseau coupé) : une commande.
  perform pg_advisory_xact_lock(hashtextextended('saisie:' || p_boutique_id::text || ':' || p_cle_idempotence, 0));
  select * into v_existante from public.commandes c
   where c.boutique_id = p_boutique_id and c.cle_idempotence = p_cle_idempotence;
  if found then
    if v_existante.origine <> 'manuelle' or v_existante.saisie_par is distinct from auth.uid() then
      raise exception 'Cette clé appartient à une autre commande' using errcode = 'unique_violation', hint = 'cle';
    end if;
    return jsonb_build_object('numero', v_existante.numero, 'statut', v_existante.statut, 'sur_place', v_existante.sur_place,
                              'total_millimes', v_existante.total_millimes, 'rejouee', true);
  end if;

  if p_canal is null or p_canal not in ('telephone', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'magasin', 'autre') then
    raise exception 'Dites d''où vient la commande' using errcode = 'check_violation', hint = 'canal';
  end if;
  v_tel := private.telephone_tunisien(v_contact ->> 'telephone');
  if v_tel is null then
    raise exception 'Numéro de téléphone tunisien attendu (8 chiffres)' using errcode = 'check_violation', hint = 'telephone';
  end if;
  if v_nom is null or char_length(v_nom) not between 2 and 80 then
    raise exception 'Indiquez le nom du client' using errcode = 'check_violation', hint = 'nom';
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Adresse e-mail illisible' using errcode = 'check_violation', hint = 'email';
  end if;
  if v_mode not in ('domicile', 'retrait', 'comptoir') then
    raise exception 'Mode de livraison inconnu' using errcode = 'check_violation', hint = 'adresse';
  end if;
  if v_mode = 'comptoir' and p_canal <> 'magasin' then
    raise exception 'Une vente au comptoir se fait au magasin' using errcode = 'check_violation', hint = 'comptoir';
  end if;
  if v_mode in ('retrait', 'comptoir') then
    v_ligne1 := null; v_ligne2 := null; v_ville := null; v_gouv := null; v_cp := null;
  else
    if v_ligne1 is null or char_length(v_ligne1) not between 3 and 200 or char_length(coalesce(v_ligne2, '')) > 200 then
      raise exception 'Indiquez l''adresse de livraison' using errcode = 'check_violation', hint = 'adresse';
    end if;
    if v_ville is null or char_length(v_ville) not between 2 and 80 then
      raise exception 'Indiquez la ville ou la délégation' using errcode = 'check_violation', hint = 'ville';
    end if;
    if v_gouv is null then
      raise exception 'Choisissez le gouvernorat' using errcode = 'check_violation', hint = 'gouvernorat';
    end if;
    if v_cp is not null and v_cp !~ '^[0-9]{4}$' then
      raise exception 'Le code postal compte 4 chiffres' using errcode = 'check_violation', hint = 'code_postal';
    end if;
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'La note compte 500 caractères au plus' using errcode = 'check_violation', hint = 'note';
  end if;

  -- Le client du numéro (son compte d'abord), sinon une fiche neuve.
  perform pg_advisory_xact_lock(hashtextextended('commande:' || p_boutique_id::text || ':' || v_tel, 0));
  select * into v_client from public.clients c
   where c.boutique_id = p_boutique_id and c.telephone = v_tel
   order by (c.user_id is not null) desc, c.created_at
   limit 1;
  if not found then
    insert into public.clients (boutique_id, nom, telephone, email)
    values (p_boutique_id, v_nom, v_tel, v_email)
    returning * into v_client;
  elsif v_client.email is null and v_email is not null then
    update public.clients set email = v_email where boutique_id = p_boutique_id and id = v_client.id
    returning * into v_client;
  end if;

  -- Les variantes, verrouillées dans un ordre stable, puis le chiffrage.
  perform 1 from public.variantes v
   where v.boutique_id = p_boutique_id
     and v.id in (select d.variante_id from private.lignes_panier(p_lignes) d)
   order by v.id
   for update;
  v_devis := private.chiffre_saisie(p_boutique_id, v_client.id, p_lignes,
                                    jsonb_build_object('mode', v_mode, 'gouvernorat', v_gouv), p_ajustements);
  if not (v_devis ->> 'complet')::boolean then
    raise exception 'Un article n''est plus disponible dans la quantité demandée'
      using errcode = 'check_violation', hint = 'stock', detail = (v_devis -> 'lignes')::text;
  end if;
  if p_total_attendu_millimes is distinct from (v_devis ->> 'total_millimes')::bigint then
    raise exception 'Le total a changé : % millimes', v_devis ->> 'total_millimes'
      using errcode = 'check_violation', hint = 'total', detail = v_devis::text;
  end if;

  insert into public.commandes (
    boutique_id, cle_idempotence, origine, canal, saisie_par, client_id, statut, mode_paiement, statut_paiement, mode_livraison, sur_place,
    contact_nom, contact_telephone, contact_email,
    livraison_ligne1, livraison_ligne2, livraison_ville, livraison_gouvernorat, livraison_code_postal, livraison_zone_nom,
    sous_total_millimes, frais_livraison_millimes, remise_millimes, total_millimes, transporteur, note_interne)
  values (
    p_boutique_id, p_cle_idempotence, 'manuelle', p_canal, auth.uid(), v_client.id, 'recue', 'cod', 'en_attente',
    case when v_mode = 'comptoir' then 'retrait' else v_mode end, v_mode = 'comptoir',
    v_nom, v_tel, v_email,
    v_ligne1, v_ligne2, v_ville, v_gouv, v_cp, coalesce(v_devis -> 'zone' ->> 'nom_fr', v_devis -> 'zone' ->> 'nom_ar'),
    (v_devis ->> 'sous_total_millimes')::bigint, (v_devis ->> 'frais_livraison_millimes')::bigint,
    (v_devis ->> 'remise_millimes')::bigint, (v_devis ->> 'total_millimes')::bigint,
    case when v_mode = 'domicile' then nullif(btrim(private.reglage(p_boutique_id, 'livraison.transporteur') #>> '{}'), '') end,
    v_note)
  returning * into v_commande;

  -- Les lignes figent nom, libellé, référence et prix ; le trigger réserve le stock.
  insert into public.commande_lignes
    (boutique_id, commande_id, variante_id, produit_nom, variante_libelle, sku,
     prix_unitaire_millimes, quantite, total_ligne_millimes, lot_id, lot_nom, remise_lot_millimes)
  select p_boutique_id, v_commande.id, (l ->> 'variante_id')::uuid, l ->> 'produit_nom', l ->> 'variante_libelle',
         l ->> 'sku', (l ->> 'prix_unitaire_millimes')::bigint, (l ->> 'quantite')::integer,
         (l ->> 'total_ligne_millimes')::bigint, (l ->> 'lot_id')::uuid, l ->> 'lot',
         coalesce((l ->> 'remise_lot_millimes')::bigint, 0)
  from jsonb_array_elements(v_devis -> 'lignes') l;

  -- Confirmée avec le client pendant l'échange : elle part en préparation.
  -- Au comptoir : confirmée, prête, remise et payée, d'un geste (chaque étape
  -- au journal, la facture SkanFact et son encaissement comme d'habitude).
  if coalesce(p_confirmee, false) or v_mode = 'comptoir' then
    update public.commandes set statut = 'confirmee'
     where boutique_id = p_boutique_id and id = v_commande.id
    returning * into v_commande;
  end if;
  if v_mode = 'comptoir' then
    update public.commandes set statut = 'expediee'
     where boutique_id = p_boutique_id and id = v_commande.id;
    update public.commandes set statut = 'livree', statut_paiement = 'paye'
     where boutique_id = p_boutique_id and id = v_commande.id
    returning * into v_commande;
  end if;

  return jsonb_build_object('numero', v_commande.numero, 'statut', v_commande.statut, 'sur_place', v_commande.sur_place,
                            'total_millimes', v_commande.total_millimes, 'rejouee', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.gestion_commande(p_boutique_id uuid, p_numero text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_commande public.commandes;
  v_resultat jsonb;
begin
  if auth.uid() is null or not private.est_membre(p_boutique_id) then
    raise exception 'Réservé à l''équipe de la boutique' using errcode = 'insufficient_privilege', hint = 'role';
  end if;
  select * into v_commande from public.commandes c where c.boutique_id = p_boutique_id and c.numero = p_numero;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'numero', c.numero, 'statut', c.statut, 'origine', c.origine, 'cree_le', c.created_at,
    'canal', c.canal, 'saisie_par', (select u.email from auth.users u where u.id = c.saisie_par), 'sur_place', c.sur_place,
    'mode_paiement', c.mode_paiement, 'statut_paiement', c.statut_paiement,
    'mode_livraison', c.mode_livraison,
    'retrait', case when c.mode_livraison = 'retrait' then private.magasin(c.boutique_id) end,
    'contact', jsonb_build_object('nom', c.contact_nom, 'telephone', c.contact_telephone, 'email', c.contact_email),
    'livraison', jsonb_build_object(
      'ligne1', c.livraison_ligne1, 'ligne2', c.livraison_ligne2, 'ville', c.livraison_ville,
      'code_postal', c.livraison_code_postal, 'gouvernorat', coalesce(g.nom_fr, c.livraison_gouvernorat),
      'zone', c.livraison_zone_nom),
    'sous_total_millimes', c.sous_total_millimes, 'frais_livraison_millimes', c.frais_livraison_millimes,
    'remise_millimes', c.remise_millimes, 'code_promo', c.code_promo, 'total_millimes', c.total_millimes,
    'transporteur', c.transporteur, 'numero_suivi', c.numero_suivi,
    'refus_origine', c.refus_origine, 'refus_commentaire', c.refus_commentaire, 'motif_annulation', c.motif_annulation,
    'note_client', c.note_client, 'note_interne', c.note_interne,
    'confirmee_le', c.confirmee_at, 'expediee_le', c.expediee_at, 'livree_le', c.livree_at, 'cloturee_le', c.cloturee_at,
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'produit_nom', l.produit_nom, 'variante_libelle', l.variante_libelle, 'sku', l.sku,
               'quantite', l.quantite, 'prix_unitaire_millimes', l.prix_unitaire_millimes,
               'total_ligne_millimes', l.total_ligne_millimes, 'lot', l.lot_nom, 'remise_lot_millimes', l.remise_lot_millimes, 'stock_restant', v.stock,
               'image', coalesce(v.image_chemin,
                 (select i.chemin from public.produit_images i
                   where i.boutique_id = v.boutique_id and i.produit_id = v.produit_id
                   order by (i.variante_id is not distinct from v.id) desc, i.position, i.created_at limit 1)))
             order by l.created_at, l.produit_nom)
      from public.commande_lignes l
      left join public.variantes v on v.boutique_id = l.boutique_id and v.id = l.variante_id
      where l.boutique_id = c.boutique_id and l.commande_id = c.id), '[]'::jsonb),
    'historique', coalesce((
      select jsonb_agg(jsonb_build_object(
               'le', e.created_at, 'avant', e.statut_avant, 'apres', e.statut_apres,
               'origine_refus', e.origine_refus, 'commentaire', e.commentaire, 'auteur', u.email)
             order by e.created_at)
      from public.commande_evenements e
      left join auth.users u on u.id = e.auteur_id
      where e.boutique_id = c.boutique_id and e.commande_id = c.id), '[]'::jsonb),
    'appels', coalesce((
      select jsonb_agg(jsonb_build_object(
               'le', k.created_at, 'canal', k.canal, 'resultat', k.resultat, 'note', k.note, 'auteur', u.email)
             order by k.created_at)
      from public.confirmations k
      left join auth.users u on u.id = k.auteur_id
      where k.boutique_id = c.boutique_id and k.commande_id = c.id), '[]'::jsonb),
    'client', (
      select jsonb_build_object(
               'nom', cl.nom, 'telephone', cl.telephone, 'compte', cl.user_id is not null,
               'nb_commandes', cl.nb_commandes, 'nb_refus', cl.nb_refus, 'niveau_risque', cl.niveau_risque,
               'depuis', cl.created_at)
      from public.clients cl where cl.boutique_id = c.boutique_id and cl.id = c.client_id),
    'autres', coalesce((
      select jsonb_agg(jsonb_build_object('numero', o.numero, 'statut', o.statut, 'cree_le', o.created_at,
                                          'total_millimes', o.total_millimes) order by o.created_at desc)
      from (select * from public.commandes o
            where o.boutique_id = c.boutique_id and o.id <> c.id
              and (o.contact_telephone = c.contact_telephone or (c.client_id is not null and o.client_id = c.client_id))
            order by o.created_at desc limit 5) o), '[]'::jsonb)
  )
  into v_resultat
  from public.commandes c
  left join public.gouvernorats g on g.code = c.livraison_gouvernorat
  where c.boutique_id = p_boutique_id and c.id = v_commande.id;

  return v_resultat;
end;
$function$;

CREATE OR REPLACE FUNCTION public.commande_suivie(p_boutique_id uuid, p_numero text, p_jeton text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'numero',        c.numero,
    'statut',        c.statut,
    'cree_le',       c.created_at,
    'mode_paiement', c.mode_paiement,
    'mode_livraison', c.mode_livraison,
    'retrait',       case when c.mode_livraison = 'retrait' then private.magasin(c.boutique_id) end,
    'contact',       jsonb_build_object('nom', c.contact_nom, 'telephone', c.contact_telephone, 'email', c.contact_email),
    'livraison',     jsonb_build_object(
                       'ligne1', c.livraison_ligne1, 'ligne2', c.livraison_ligne2, 'ville', c.livraison_ville,
                       'code_postal', c.livraison_code_postal, 'gouvernorat', coalesce(g.nom_fr, c.livraison_gouvernorat),
                       'zone', c.livraison_zone_nom),
    'note_client',   c.note_client,
    'sous_total_millimes',      c.sous_total_millimes,
    'frais_livraison_millimes', c.frais_livraison_millimes,
    'remise_millimes',          c.remise_millimes,
    'code_promo',               c.code_promo,
    'total_millimes',           c.total_millimes,
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'produit_nom', l.produit_nom, 'variante_libelle', l.variante_libelle, 'sku', l.sku,
               'quantite', l.quantite, 'prix_unitaire_millimes', l.prix_unitaire_millimes,
               'total_ligne_millimes', l.total_ligne_millimes, 'lot', l.lot_nom, 'remise_lot_millimes', l.remise_lot_millimes,
               'image', coalesce(v.image_chemin,
                 (select i.chemin from public.produit_images i
                   where i.boutique_id = v.boutique_id and i.produit_id = v.produit_id
                   order by (i.variante_id is not distinct from v.id) desc, i.position, i.created_at
                   limit 1)))
             order by l.created_at, l.produit_nom)
      from public.commande_lignes l
      left join public.variantes v on v.boutique_id = l.boutique_id and v.id = l.variante_id
      where l.boutique_id = c.boutique_id and l.commande_id = c.id), '[]'::jsonb)
  )
  from public.commandes c
  join plateforme.boutiques b on b.id = c.boutique_id and b.statut = 'active'
  left join public.gouvernorats g on g.code = c.livraison_gouvernorat
  where c.boutique_id = p_boutique_id
    and c.numero = p_numero
    and p_jeton ~ '^[0-9a-f]{64}$'
    and c.jeton_suivi_hash = sha256(convert_to(p_jeton, 'UTF8'));
$function$;
