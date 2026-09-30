-- =====================================================================
-- SkanEcom — 34 · LA RÉCEPTION D'UN ARRIVAGE, EN UNE FOIS
-- 30/09/2026 — PRD §6.2 B2 (le stock) : « quand le conteneur arrive, on
-- ne rentre pas quarante valises une par une »
-- =====================================================================
--
-- Un arrivage du fournisseur, c'est vingt déclinaisons d'un coup (cabine,
-- moyenne, grande × trois couleurs…). Jusqu'ici, chacune se recevait depuis
-- sa fiche. Désormais :
--   · gestion_reception_catalogue : les déclinaisons en vente de toute la
--     boutique, produit par produit, avec leur stock et leur seuil ;
--   · gestion_reception : les quantités reçues de plusieurs déclinaisons,
--     passées en un seul geste — tout ou rien —, chacune par
--     public.mouvement_stock (le seul chemin du stock), au motif
--     « réception », avec la même note (le bon de livraison) et le même
--     auteur.
-- Qui : propriétaire, administrateur, préparation (comme un mouvement de
-- stock depuis la fiche).

create function public.gestion_reception_catalogue(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,preparateur}');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'nom', p.nom_fr, 'marque', p.marque, 'publie', p.publie,
             'image', (select i.chemin from public.produit_images i
                        where i.boutique_id = p.boutique_id and i.produit_id = p.id
                        order by i.position, i.created_at limit 1),
             'variantes', (select jsonb_agg(jsonb_build_object(
                                    'id', v.id, 'sku', v.sku, 'stock', v.stock, 'seuil', v.seuil_alerte_stock,
                                    'libelle', private.libelle_variante(p.boutique_id, p.id, v.options))
                                  order by v.position, v.sku)
                             from public.variantes v
                            where v.boutique_id = p.boutique_id and v.produit_id = p.id and v.actif))
           order by p.nom_fr, p.id)
      from public.produits p
     where p.boutique_id = p_boutique_id
       and exists (select 1 from public.variantes v where v.boutique_id = p.boutique_id and v.produit_id = p.id and v.actif)
  ), '[]'::jsonb);
end;
$$;

create function public.gestion_reception(p_boutique_id uuid, p_lignes jsonb, p_commentaire text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_note    text := nullif(btrim(coalesce(p_commentaire, '')), '');
  v_ligne   record;
  v_pieces  integer := 0;
  v_nombre  integer := 0;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,preparateur}');
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Indiquez au moins une quantité reçue' using errcode = 'check_violation', hint = 'lignes';
  end if;
  if jsonb_array_length(p_lignes) > 500 then
    raise exception 'Au plus 500 déclinaisons par réception' using errcode = 'check_violation', hint = 'lignes';
  end if;
  if length(coalesce(v_note, '')) > 300 then
    raise exception 'Note trop longue (300 caractères)' using errcode = 'check_violation', hint = 'commentaire';
  end if;
  if (select count(*) from jsonb_array_elements(p_lignes) l) <>
     (select count(distinct l ->> 'variante_id') from jsonb_array_elements(p_lignes) l) then
    raise exception 'Une déclinaison apparaît deux fois' using errcode = 'check_violation', hint = 'double';
  end if;

  -- Dans l'ordre des identifiants : deux réceptions simultanées verrouillent
  -- les déclinaisons dans le même ordre (pas d'interblocage).
  for v_ligne in
    select (l ->> 'variante_id') as id_texte, (l ->> 'quantite') as quantite_texte
      from jsonb_array_elements(p_lignes) l
     order by l ->> 'variante_id'
  loop
    if v_ligne.quantite_texte is null or v_ligne.quantite_texte !~ '^[0-9]{1,6}$'
       or v_ligne.quantite_texte::integer < 1 or v_ligne.quantite_texte::integer > 100000 then
      raise exception 'Quantité invalide : %', coalesce(v_ligne.quantite_texte, '(vide)') using errcode = 'check_violation', hint = 'quantite';
    end if;
    if v_ligne.id_texte is null or v_ligne.id_texte !~ '^[0-9a-fA-F-]{36}$'
       or not exists (select 1 from public.variantes v
                       where v.boutique_id = p_boutique_id and v.id = v_ligne.id_texte::uuid and v.actif) then
      raise exception 'Déclinaison introuvable, ou retirée de la vente' using errcode = 'no_data_found', hint = 'variante';
    end if;
    perform public.mouvement_stock(p_boutique_id, v_ligne.id_texte::uuid, v_ligne.quantite_texte::integer,
                                   'reception', coalesce(v_note, 'Réception'));
    v_pieces := v_pieces + v_ligne.quantite_texte::integer;
    v_nombre := v_nombre + 1;
  end loop;

  return jsonb_build_object('declinaisons', v_nombre, 'pieces', v_pieces);
end;
$$;

revoke execute on function public.gestion_reception_catalogue(uuid) from public, anon;
revoke execute on function public.gestion_reception(uuid, jsonb, text) from public, anon;
grant  execute on function public.gestion_reception_catalogue(uuid) to authenticated, service_role;
grant  execute on function public.gestion_reception(uuid, jsonb, text) to authenticated, service_role;
