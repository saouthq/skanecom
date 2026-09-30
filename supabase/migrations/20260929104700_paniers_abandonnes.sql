-- =====================================================================
-- SkanEcom — 48 · LES PANIERS ABANDONNÉS
-- =====================================================================
--
-- Une cliente connectée remplit son panier, arrive au récapitulatif du
-- tunnel, et part sans confirmer. La boutique qui l'a choisi (réglage
-- commande.relance_paniers, coupé par défaut) voit ce panier au backoffice
-- une heure plus tard, avec le message WhatsApp prêt, et la relance UNE
-- fois. Le tunnel le dit, sous l'identité vérifiée, et la politique de
-- confidentialité aussi. Avec la commande en invité, le tunnel ne connaît
-- personne : rien n'est gardé.
--
-- Le panier est gardé par la route du devis (chaque récapitulatif calculé
-- pour une personne connectée : public.garder_panier), relu par la base :
-- ses déclinaisons, leurs quantités, son montant à ses prix (un pro : ses
-- prix pro). Il est « abandonné » s'il n'a pas bougé depuis une heure et
-- qu'aucune commande n'a suivi. Un panier de plus de 60 jours s'efface ;
-- couper le réglage les efface tous.
-- =====================================================================

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('commande.relance_paniers', 'booleen', null, 'false', 'commande', null, true,
     'Relancer les paniers abandonnés',
     'Oui = le panier d''un client connecté (compte obligatoire) qui n''a pas fini sa commande s''affiche au backoffice une heure plus tard ; l''équipe peut le relancer une fois, message prêt. Le tunnel et la politique de confidentialité le disent. Non = rien n''est gardé (couper efface les paniers gardés).', 5);

create table public.paniers_suivis (
  id                  uuid primary key default gen_random_uuid(),
  boutique_id         uuid not null references plateforme.boutiques (id) on delete cascade,
  -- La personne connectée ; ou rien (jeu de démonstration) : le téléphone suffit.
  user_id             uuid references auth.users (id) on delete cascade,
  telephone           text check (telephone ~ '^\+216[0-9]{8}$'),
  email               text check (char_length(email) <= 200),
  -- [{variante_id, quantite}] : relus au backoffice (noms, photos, prix du jour).
  lignes              jsonb not null check (jsonb_typeof(lignes) = 'array' and jsonb_array_length(lignes) between 1 and 50),
  sous_total_millimes bigint not null check (sous_total_millimes >= 0),
  articles            integer not null check (articles > 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  relance_le          timestamptz,
  relance_par         uuid references auth.users (id) on delete set null,
  ignore_le           timestamptz,
  unique (boutique_id, id),
  constraint paniers_suivis_contact check (telephone is not null or email is not null)
);

comment on table public.paniers_suivis is
  'Le dernier panier d''un client connecté au tunnel (réglage commande.relance_paniers) : relu au backoffice pour une relance, une seule ; effacé après 60 jours, ou quand la boutique coupe le réglage.';

create unique index paniers_suivis_user_unique on public.paniers_suivis (boutique_id, user_id) where user_id is not null;
create index paniers_suivis_recents_idx on public.paniers_suivis (boutique_id, updated_at desc);

create trigger paniers_suivis_boutique_immuable before update of boutique_id on public.paniers_suivis
  for each row execute function private.boutique_immuable();

alter table public.paniers_suivis enable row level security;
create policy "paniers_suivis: l'équipe lit ceux de sa boutique"
  on public.paniers_suivis for select using (boutique_id in (select private.mes_boutiques()));
revoke insert, update, delete, truncate on public.paniers_suivis from anon, authenticated;

-- Couper le réglage (la ligne revient au défaut : effacée, ou mise à faux) :
-- plus rien n'est gardé, pas même les paniers d'avant.
create function private.paniers_reglage_coupe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or new.valeur is distinct from 'true'::jsonb then
    delete from public.paniers_suivis p where p.boutique_id = old.boutique_id;
  end if;
  return null;
end;
$$;

revoke execute on function private.paniers_reglage_coupe() from public, anon, authenticated;

create trigger reglages_paniers_coupes after update or delete on public.reglages
  for each row when (old.cle = 'commande.relance_paniers')
  execute function private.paniers_reglage_coupe();

-- La commande qui a suivi un panier (du même compte, ou du même téléphone),
-- passée depuis `p_depuis` : son numéro, ou rien.
create function private.commande_apres_panier(p_panier public.paniers_suivis, p_depuis timestamptz)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select o.numero
    from public.commandes o
    left join public.clients c on c.boutique_id = o.boutique_id and c.id = o.client_id
   where o.boutique_id = p_panier.boutique_id and o.created_at >= p_depuis and o.statut <> 'annulee'
     and ((p_panier.user_id is not null and c.user_id = p_panier.user_id)
          or (p_panier.telephone is not null and o.contact_telephone = p_panier.telephone))
   order by o.created_at
   limit 1
$$;

revoke execute on function private.commande_apres_panier(public.paniers_suivis, timestamptz) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- Le tunnel : le panier de la personne connectée
-- ---------------------------------------------------------------------
-- Appelée par la route du devis, à chaque récapitulatif. Rien sans le
-- réglage, ni en commande invité (le tunnel n'a pas pu le dire). Le panier est relu comme le récapitulatif (private.chiffre_commande) :
-- seules les pièces de la boutique restent, au prix de cette personne.
-- Un panier vide efface le sien. Un panier déjà commandé (ou vieux de
-- 14 jours) repart de zéro : relançable de nouveau. Rend vrai si le panier
-- est gardé.
create function public.garder_panier(p_boutique_id uuid, p_lignes jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_recap    jsonb;
  v_lignes   jsonb;
  v_articles integer;
  v_total    bigint;
  v_tel      text;
  v_email    text;
  v_avant    public.paniers_suivis;
begin
  if auth.uid() is null or not coalesce((private.reglage(p_boutique_id, 'commande.relance_paniers'))::boolean, false)
     or not coalesce((private.reglage(p_boutique_id, 'compte.obligatoire'))::boolean, true) then
    return false;
  end if;

  -- Le ménage : les paniers de plus de 60 jours de la boutique.
  delete from public.paniers_suivis p where p.boutique_id = p_boutique_id and p.updated_at < now() - interval '60 days';

  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    delete from public.paniers_suivis p where p.boutique_id = p_boutique_id and p.user_id = auth.uid();
    return false;
  end if;
  begin
    v_recap := private.chiffre_commande(p_boutique_id, p_lignes, null, false);
  exception when check_violation then
    return false;  -- un panier illisible : le récapitulatif l'a déjà refusé
  end;
  select coalesce(jsonb_agg(jsonb_build_object('variante_id', l ->> 'variante_id', 'quantite', (l ->> 'quantite')::integer) order by n), '[]'::jsonb),
         coalesce(sum((l ->> 'quantite')::integer), 0)
    into v_lignes, v_articles
    from jsonb_array_elements(v_recap -> 'lignes') with ordinality as e(l, n)
   where l ->> 'produit_nom' is not null;
  v_total := coalesce((v_recap ->> 'sous_total_millimes')::bigint, 0);

  if jsonb_array_length(v_lignes) = 0 then
    delete from public.paniers_suivis p where p.boutique_id = p_boutique_id and p.user_id = auth.uid();
    return false;
  end if;

  select private.telephone_tunisien(u.phone), case when char_length(u.email) between 3 and 200 then lower(u.email) end
    into v_tel, v_email from auth.users u where u.id = auth.uid();
  if v_tel is null and v_email is null then
    return false;
  end if;

  select p.* into v_avant from public.paniers_suivis p where p.boutique_id = p_boutique_id and p.user_id = auth.uid() for update;
  if not found then
    insert into public.paniers_suivis (boutique_id, user_id, telephone, email, lignes, sous_total_millimes, articles, created_at, updated_at)
    values (p_boutique_id, auth.uid(), v_tel, v_email, v_lignes, v_total, v_articles, clock_timestamp(), clock_timestamp())
    on conflict (boutique_id, user_id) where user_id is not null do nothing;
  elsif private.commande_apres_panier(v_avant, v_avant.updated_at) is not null or v_avant.updated_at < now() - interval '14 days' then
    -- Commandé depuis, ou trop ancien : un nouveau panier, une nouvelle relance possible.
    update public.paniers_suivis p
       set telephone = v_tel, email = v_email, lignes = v_lignes, sous_total_millimes = v_total, articles = v_articles,
           created_at = clock_timestamp(), updated_at = clock_timestamp(), relance_le = null, relance_par = null, ignore_le = null
     where p.id = v_avant.id;
  elsif v_avant.lignes is distinct from v_lignes or v_avant.sous_total_millimes is distinct from v_total then
    update public.paniers_suivis p
       set telephone = v_tel, email = v_email, lignes = v_lignes, sous_total_millimes = v_total, articles = v_articles,
           updated_at = clock_timestamp()
     where p.id = v_avant.id;
  end if;
  return true;
end;
$$;

revoke execute on function public.garder_panier(uuid, jsonb) from public, anon;
grant  execute on function public.garder_panier(uuid, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- Le backoffice : à relancer, relancés
-- ---------------------------------------------------------------------
create function public.gestion_paniers(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return (
    with suivis as (
      select p.*,
             private.commande_apres_panier(p, p.updated_at) as commande_apres,
             case when p.relance_le is not null then private.commande_apres_panier(p, p.relance_le) end as commande_relance,
             (select c.nom from public.clients c
               where c.boutique_id = p.boutique_id
                 and ((p.user_id is not null and c.user_id = p.user_id) or (p.user_id is null and c.telephone = p.telephone))
               order by c.created_at limit 1) as nom
        from public.paniers_suivis p
       where p.boutique_id = p_boutique_id and p.updated_at > now() - interval '30 days'
    ), vus as (
      select s.*,
             case
               when s.relance_le is not null then 'relance'
               when s.commande_apres is not null then 'commande'
               when s.ignore_le is not null then 'ignore'
               when s.updated_at > now() - interval '1 hour' then 'en_cours'
               when s.updated_at < now() - interval '14 days' then 'ancien'
               else 'a_relancer'
             end as etat
        from suivis s
    )
    select jsonb_build_object(
      'actif', coalesce((private.reglage(p_boutique_id, 'commande.relance_paniers'))::boolean, false),
      -- La commande en invité : plus aucun panier n'arrive (l'écran le dit).
      'invites', not coalesce((private.reglage(p_boutique_id, 'compte.obligatoire'))::boolean, true),
      'compteurs', jsonb_build_object(
        'a_relancer', count(*) filter (where v.etat = 'a_relancer'),
        'relances', count(*) filter (where v.etat = 'relance'),
        'commandes_apres_relance', count(*) filter (where v.etat = 'relance' and v.commande_relance is not null),
        'en_cours', count(*) filter (where v.etat = 'en_cours')),
      'paniers', coalesce(jsonb_agg(jsonb_build_object(
          'id', v.id, 'etat', v.etat, 'nom', v.nom, 'telephone', v.telephone, 'email', v.email,
          'sous_total_millimes', v.sous_total_millimes, 'articles', v.articles,
          'depuis', v.updated_at, 'relance_le', v.relance_le,
          'relance_par', (select u.email from auth.users u where u.id = v.relance_par),
          'commande', coalesce(v.commande_relance, v.commande_apres),
          'lignes', (select coalesce(jsonb_agg(jsonb_build_object(
                             'variante_id', va.id, 'produit', coalesce(pr.nom_fr, pr.nom_ar), 'slug', pr.slug,
                             'libelle', private.libelle_variante(p_boutique_id, pr.id, va.options),
                             'quantite', (l ->> 'quantite')::integer, 'prix_millimes', va.prix_millimes,
                             'en_vente', va.actif and pr.publie and va.stock >= greatest(va.quantite_min, 1),
                             'image', coalesce(va.image_chemin,
                                        (select i.chemin from public.produit_images i
                                          where i.boutique_id = va.boutique_id and i.produit_id = pr.id
                                          order by (i.variante_id is not distinct from va.id) desc, i.position, i.created_at limit 1)))
                           order by n), '[]'::jsonb)
                       from jsonb_array_elements(v.lignes) with ordinality as e(l, n)
                       join public.variantes va on va.boutique_id = v.boutique_id and va.id = (l ->> 'variante_id')::uuid
                       join public.produits pr on pr.boutique_id = va.boutique_id and pr.id = va.produit_id))
        order by (v.etat = 'a_relancer') desc, v.updated_at desc)
        filter (where v.etat in ('a_relancer', 'relance')), '[]'::jsonb))
    from vus v);
end;
$$;

create function public.gestion_geste_panier(p_boutique_id uuid, p_panier_id uuid, p_geste text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_p public.paniers_suivis;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,confirmateur}');
  if p_geste is null or p_geste not in ('relance', 'ignore') then
    raise exception 'Geste inconnu : %', p_geste using errcode = 'check_violation', hint = 'geste';
  end if;
  select p.* into v_p from public.paniers_suivis p where p.boutique_id = p_boutique_id and p.id = p_panier_id for update;
  if not found then
    raise exception 'Ce panier n''est plus gardé' using errcode = 'check_violation', hint = 'introuvable';
  end if;
  if v_p.relance_le is not null or v_p.ignore_le is not null then
    raise exception 'Ce panier a déjà été traité par un collègue' using errcode = 'check_violation', hint = 'etat';
  end if;
  if private.commande_apres_panier(v_p, v_p.updated_at) is not null then
    raise exception 'Ce client a commandé depuis : rien à relancer' using errcode = 'check_violation', hint = 'commande';
  end if;
  if p_geste = 'relance' then
    update public.paniers_suivis set relance_le = now(), relance_par = auth.uid() where id = v_p.id;
  else
    update public.paniers_suivis set ignore_le = now() where id = v_p.id;
  end if;
  perform private.console_trace(auth.uid(), p_boutique_id, 'panier.' || p_geste, v_p.id::text, null,
    jsonb_build_object('articles', v_p.articles, 'sous_total', v_p.sous_total_millimes));
  return jsonb_build_object('geste', p_geste, 'nom', (select c.nom from public.clients c
                                                      where c.boutique_id = p_boutique_id
                                                        and ((v_p.user_id is not null and c.user_id = v_p.user_id)
                                                             or (v_p.user_id is null and c.telephone = v_p.telephone))
                                                      order by c.created_at limit 1));
end;
$$;

-- La navigation et « Aujourd'hui » : le réglage, les paniers à relancer.
-- Au passage, le ménage des 60 jours (une boutique sans visite de client
-- connecté garde sa promesse aussi).
create function public.gestion_paniers_etat(p_boutique_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  delete from public.paniers_suivis p where p.boutique_id = p_boutique_id and p.updated_at < now() - interval '60 days';
  return jsonb_build_object(
    'actif', coalesce((private.reglage(p_boutique_id, 'commande.relance_paniers'))::boolean, false),
    'a_relancer', (select count(*) from public.paniers_suivis p
                    where p.boutique_id = p_boutique_id and p.relance_le is null and p.ignore_le is null
                      and p.updated_at between now() - interval '14 days' and now() - interval '1 hour'
                      and private.commande_apres_panier(p, p.updated_at) is null));
end;
$$;

revoke execute on function public.gestion_paniers(uuid) from public, anon;
revoke execute on function public.gestion_geste_panier(uuid, uuid, text) from public, anon;
revoke execute on function public.gestion_paniers_etat(uuid) from public, anon;
grant  execute on function public.gestion_paniers(uuid) to authenticated;
grant  execute on function public.gestion_geste_panier(uuid, uuid, text) to authenticated;
grant  execute on function public.gestion_paniers_etat(uuid) to authenticated;
