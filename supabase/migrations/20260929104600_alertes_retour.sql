-- =====================================================================
-- SkanEcom — 47 · « PRÉVENEZ-MOI DE SON RETOUR »
-- =====================================================================
--
-- Une déclinaison épuisée (ou sous son minimum de commande) : l'acheteur
-- laisse son téléphone ou son e-mail sur la fiche. Quand le stock revient
-- (un arrivage, un inventaire, une commande annulée), la demande passe
-- « à prévenir » : l'équipe la voit au backoffice, le message WhatsApp
-- prêt (ou l'e-mail), et la marque prévenue. Le contact est alors effacé :
-- il ne servait qu'à ce message (la contrainte le garantit).
--
-- Un réglage de la boutique (catalogue.prevenir_retour), coupé par défaut :
-- c'est une promesse faite au client, l'équipe doit pouvoir la tenir.
--
-- Garde-fous : une demande ne vaut que pour une déclinaison en vente et
-- indisponible ; la même demande deux fois ne s'ajoute pas ; dix demandes
-- par contact et par jour, trois cents par heure pour une boutique.
-- =====================================================================

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('catalogue.prevenir_retour', 'booleen', null, 'false', 'catalogue', null, true,
     'Prévenir du retour d''une pièce épuisée',
     'Oui = sur une déclinaison épuisée, la fiche propose « Prévenez-moi de son retour » (téléphone ou e-mail) ; quand le stock revient, l''équipe voit qui prévenir, message prêt. Non = la fiche dit seulement que la pièce est épuisée.', 31);

-- Au passage : le préfixe des numéros de commande se lit sur chaque
-- commande ; la vitrine le connaît pour l'exemple de « Suivre ma commande »
-- (qui disait « CMD-… » chez Maison Selma, dont les numéros sont « SEL-… »).
update plateforme.reglages_catalogue set public = true where cle = 'commande.prefixe_numero';

create table public.alertes_retour (
  id            uuid primary key default gen_random_uuid(),
  boutique_id   uuid not null references plateforme.boutiques (id) on delete cascade,
  variante_id   uuid not null,
  telephone     text check (telephone ~ '^\+216[0-9]{8}$'),
  email         text check (char_length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  statut        text not null default 'attend' check (statut in ('attend', 'a_prevenir', 'prevenue', 'annulee')),
  created_at    timestamptz not null default now(),
  -- Quand la pièce est revenue ; quand, et par qui, la personne a été prévenue.
  disponible_le timestamptz,
  close_le      timestamptz,
  close_par     uuid references auth.users (id) on delete set null,
  unique (boutique_id, id),
  foreign key (boutique_id, variante_id) references public.variantes (boutique_id, id) on delete cascade,
  -- Un contact tant qu'il reste quelqu'un à prévenir ; aucun ensuite.
  constraint alertes_retour_contact check (
    (statut in ('attend', 'a_prevenir')) = (telephone is not null or email is not null)),
  constraint alertes_retour_close check ((statut in ('prevenue', 'annulee')) = (close_le is not null))
);

comment on table public.alertes_retour is
  'Les demandes « prévenez-moi de son retour » d''une déclinaison épuisée : le contact ne sert qu''à ce message, effacé une fois la personne prévenue.';

create unique index alertes_retour_tel_unique on public.alertes_retour (boutique_id, variante_id, telephone)
  where statut in ('attend', 'a_prevenir') and telephone is not null;
create unique index alertes_retour_email_unique on public.alertes_retour (boutique_id, variante_id, lower(email))
  where statut in ('attend', 'a_prevenir') and email is not null;
create index alertes_retour_ouvertes_idx on public.alertes_retour (boutique_id, statut, variante_id)
  where statut in ('attend', 'a_prevenir');
create index alertes_retour_recentes_idx on public.alertes_retour (boutique_id, created_at);

create trigger alertes_retour_boutique_immuable before update of boutique_id on public.alertes_retour
  for each row execute function private.boutique_immuable();

alter table public.alertes_retour enable row level security;
create policy "alertes_retour: l'équipe lit celles de sa boutique"
  on public.alertes_retour for select using (boutique_id in (select private.mes_boutiques()));
revoke insert, update, delete, truncate on public.alertes_retour from anon, authenticated;


-- Le stock revient (au moins le minimum d'une commande) : ceux qui
-- attendaient cette déclinaison sont à prévenir.
create function private.alertes_au_retour()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stock >= new.quantite_min and old.stock < old.quantite_min then
    update public.alertes_retour a set statut = 'a_prevenir', disponible_le = now()
     where a.boutique_id = new.boutique_id and a.variante_id = new.id and a.statut = 'attend';
  end if;
  return new;
end;
$$;

create trigger variantes_alertes_retour
  after update of stock on public.variantes
  for each row when (new.stock > old.stock)
  execute function private.alertes_au_retour();

revoke execute on function private.alertes_au_retour() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- La vitrine : la demande
-- ---------------------------------------------------------------------
create function public.demander_alerte_retour(p_boutique_id uuid, p_variante_id uuid, p_telephone text, p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_saisi_tel text := nullif(btrim(coalesce(p_telephone, '')), '');
  v_tel       text := private.telephone_tunisien(p_telephone);
  v_email     text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_v         record;
begin
  if not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut = 'active') then
    raise exception 'Boutique introuvable' using errcode = 'check_violation', hint = 'boutique';
  end if;
  if not coalesce((private.reglage(p_boutique_id, 'catalogue.prevenir_retour'))::boolean, false) then
    raise exception 'Cette boutique ne prévient pas du retour des pièces' using errcode = 'check_violation', hint = 'reglage';
  end if;
  if v_saisi_tel is not null and v_tel is null then
    raise exception 'Ce numéro ne ressemble pas à un numéro tunisien : huit chiffres, par exemple 20 123 456'
      using errcode = 'check_violation', hint = 'telephone';
  end if;
  if v_email is not null and (char_length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Cette adresse e-mail est illisible' using errcode = 'check_violation', hint = 'email';
  end if;
  if v_tel is null and v_email is null then
    raise exception 'Un téléphone ou une adresse e-mail, pour vous prévenir' using errcode = 'check_violation', hint = 'contact';
  end if;

  select v.stock, v.quantite_min, v.actif and p.publie as en_vente into v_v
    from public.variantes v
    join public.produits p on p.boutique_id = v.boutique_id and p.id = v.produit_id
   where v.boutique_id = p_boutique_id and v.id = p_variante_id;
  if not found or not v_v.en_vente then
    raise exception 'Cette pièce n''est plus en vente' using errcode = 'check_violation', hint = 'variante';
  end if;
  if v_v.stock >= v_v.quantite_min then
    raise exception 'Bonne nouvelle : cette pièce est disponible, vous pouvez la commander' using errcode = 'check_violation', hint = 'disponible';
  end if;

  -- Déjà demandé pour ce contact : rien de plus.
  if exists (select 1 from public.alertes_retour a
              where a.boutique_id = p_boutique_id and a.variante_id = p_variante_id and a.statut in ('attend', 'a_prevenir')
                and (a.telephone = v_tel or lower(a.email) = v_email)) then
    return jsonb_build_object('ok', true, 'deja', true);
  end if;
  if (select count(*) from public.alertes_retour a
       where a.boutique_id = p_boutique_id and a.created_at > now() - interval '1 day'
         and (a.telephone = v_tel or lower(a.email) = v_email)) >= 10
     or (select count(*) from public.alertes_retour a
          where a.boutique_id = p_boutique_id and a.created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Beaucoup de demandes aujourd''hui : réessayez demain, ou appelez la boutique' using errcode = 'check_violation', hint = 'essais';
  end if;

  insert into public.alertes_retour (boutique_id, variante_id, telephone, email)
  values (p_boutique_id, p_variante_id, v_tel, case when v_tel is null then v_email end)
  on conflict do nothing;
  return jsonb_build_object('ok', true, 'deja', false);
end;
$$;

revoke execute on function public.demander_alerte_retour(uuid, uuid, text, text) from public;
grant  execute on function public.demander_alerte_retour(uuid, uuid, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------
-- Le backoffice : qui prévenir, qui attend
-- ---------------------------------------------------------------------
-- Les pièces demandées : celles revenues d'abord (qui prévenir, et depuis
-- quand), puis celles qu'on attend encore (combien de personnes, depuis
-- quand) ; ce qu'il en reste en stock. Toute l'équipe lit.
create function public.gestion_alertes_retour(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', coalesce((private.reglage(p_boutique_id, 'catalogue.prevenir_retour'))::boolean, false),
    'compteurs', (select jsonb_build_object(
                    'a_prevenir', count(*) filter (where a.statut = 'a_prevenir'),
                    'attend', count(*) filter (where a.statut = 'attend'),
                    'prevenues_30j', count(*) filter (where a.statut = 'prevenue' and a.close_le > now() - interval '30 days'))
                  from public.alertes_retour a where a.boutique_id = p_boutique_id),
    'pieces', coalesce((
      select jsonb_agg(jsonb_build_object(
               'variante_id', v.id, 'produit_id', p.id, 'produit', coalesce(p.nom_fr, p.nom_ar), 'slug', p.slug,
               'libelle', private.libelle_variante(p_boutique_id, p.id, v.options), 'sku', v.sku,
               'stock', v.stock, 'minimum', v.quantite_min, 'disponible', v.stock >= v.quantite_min,
               'image', coalesce(v.image_chemin,
                          (select i.chemin from public.produit_images i
                            where i.boutique_id = v.boutique_id and i.produit_id = p.id
                            order by (i.variante_id is not distinct from v.id) desc, i.position, i.created_at limit 1)),
               'a_prevenir', coalesce((select jsonb_agg(jsonb_build_object(
                                         'id', a.id, 'telephone', a.telephone, 'email', a.email,
                                         'demande_le', a.created_at, 'disponible_le', a.disponible_le)
                                       order by a.created_at)
                                        from public.alertes_retour a
                                       where a.boutique_id = v.boutique_id and a.variante_id = v.id and a.statut = 'a_prevenir'), '[]'::jsonb),
               'attend', (select count(*) from public.alertes_retour a
                           where a.boutique_id = v.boutique_id and a.variante_id = v.id and a.statut = 'attend'),
               'depuis', (select min(a.created_at) from public.alertes_retour a
                           where a.boutique_id = v.boutique_id and a.variante_id = v.id and a.statut in ('attend', 'a_prevenir')),
               'revenue_le', (select min(a.disponible_le) from public.alertes_retour a
                               where a.boutique_id = v.boutique_id and a.variante_id = v.id and a.statut = 'a_prevenir'))
             order by (exists (select 1 from public.alertes_retour a
                                where a.boutique_id = v.boutique_id and a.variante_id = v.id and a.statut = 'a_prevenir')) desc,
                      (select count(*) from public.alertes_retour a
                        where a.boutique_id = v.boutique_id and a.variante_id = v.id and a.statut = 'attend') desc,
                      coalesce(p.nom_fr, p.nom_ar), v.sku)
        from public.variantes v
        join public.produits p on p.boutique_id = v.boutique_id and p.id = v.produit_id
       where v.boutique_id = p_boutique_id
         and exists (select 1 from public.alertes_retour a
                      where a.boutique_id = v.boutique_id and a.variante_id = v.id and a.statut in ('attend', 'a_prevenir'))), '[]'::jsonb));
end;
$$;

-- Prévenues (le message est parti) : le contact s'efface. Ou annulées (la
-- pièce ne reviendra pas) : toutes les demandes de la déclinaison.
create function public.gestion_clore_alertes(p_boutique_id uuid, p_ids uuid[], p_issue text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,confirmateur}');
  if p_issue is null or p_issue not in ('prevenue', 'annulee') then
    raise exception 'Issue inconnue : %', p_issue using errcode = 'check_violation', hint = 'issue';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then
    raise exception 'Aucune demande désignée' using errcode = 'check_violation', hint = 'demandes';
  end if;
  update public.alertes_retour a
     set statut = p_issue, close_le = now(), close_par = auth.uid(), telephone = null, email = null
   where a.boutique_id = p_boutique_id and a.id = any (p_ids)
     and a.statut in (case when p_issue = 'prevenue' then 'a_prevenir' else 'attend' end, 'a_prevenir');
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Ces demandes ont déjà été traitées' using errcode = 'check_violation', hint = 'etat';
  end if;
  perform private.console_trace(auth.uid(), p_boutique_id, 'alerte_retour.' || p_issue, null, null, jsonb_build_object('demandes', v_n));
  return v_n;
end;
$$;

-- La navigation : le réglage, et combien de personnes à prévenir.
create function public.gestion_alertes_etat(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', coalesce((private.reglage(p_boutique_id, 'catalogue.prevenir_retour'))::boolean, false),
    'a_prevenir', (select count(*) from public.alertes_retour a where a.boutique_id = p_boutique_id and a.statut = 'a_prevenir'),
    'ouvertes', (select count(*) from public.alertes_retour a where a.boutique_id = p_boutique_id and a.statut in ('attend', 'a_prevenir')));
end;
$$;

revoke execute on function public.gestion_alertes_retour(uuid) from public, anon;
revoke execute on function public.gestion_clore_alertes(uuid, uuid[], text) from public, anon;
revoke execute on function public.gestion_alertes_etat(uuid) from public, anon;
grant  execute on function public.gestion_alertes_retour(uuid) to authenticated;
grant  execute on function public.gestion_clore_alertes(uuid, uuid[], text) to authenticated;
grant  execute on function public.gestion_alertes_etat(uuid) to authenticated;
