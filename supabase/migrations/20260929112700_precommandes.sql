-- =====================================================================
-- SkanEcom — 88 · LES PRÉCOMMANDES SUR ARRIVAGE
-- =====================================================================
--
-- Le conteneur arrive le 20 : les valises noires sont épuisées, mais cent
-- sont en route. La boutique annonce l'arrivage (sa date, ce qu'il apporte,
-- déclinaison par déclinaison) ; la vitrine propose alors « Précommander —
-- arrive vers le 20 octobre » sur ce qui est épuisé, dans la limite de ce
-- qui arrive. Le client commande comme d'habitude, paiement à la livraison :
--
--   · une ligne en précommande ne prend pas de stock (il n'y en a pas) ; sa
--     commande « attend l'arrivage » : l'équipe la confirme au téléphone
--     comme les autres, mais elle ne part pas tant que ses pièces ne sont
--     pas là (la base refuse de l'expédier) ;
--   · à chaque hausse du stock — la réception de l'arrivage, une correction,
--     une commande annulée qui rend ses pièces — les précommandes servent d'abord, dans l'ordre
--     où elles ont été passées : le stock leur est réservé, le mouvement est
--     au journal (« Précommande MAY-… »), et la commande servie de toutes
--     ses pièces rejoint « À préparer » ;
--   · une précommande annulée ou refusée ne rend pas un stock qu'elle n'a
--     jamais pris ; une vente au comptoir ne se fait pas en précommande.
--
-- Réglage catalogue.precommandes, coupé par défaut.
-- =====================================================================

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('catalogue.precommandes', 'booleen', null, 'false', 'catalogue', null, true,
     'Précommandes sur arrivage',
     'Oui = une déclinaison épuisée qu''un arrivage annoncé apporte se précommande sur la vitrine (« arrive vers le … »), dans la limite de ce qui arrive ; à la réception, le stock sert d''abord les précommandes. Non = une pièce épuisée ne se commande pas.', 32);

-- ---------------------------------------------------------------------
-- 1. Les arrivages annoncés
-- ---------------------------------------------------------------------
create table public.arrivages (
  id          uuid primary key default gen_random_uuid(),
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  nom         text not null constraint arrivages_nom check (char_length(btrim(nom)) between 2 and 60),
  date_prevue date not null,
  note        text constraint arrivages_note check (note is null or char_length(note) <= 300),
  statut      text not null default 'attendu' constraint arrivages_statut check (statut in ('attendu', 'recu', 'annule')),
  recu_le     timestamptz,
  created_at  timestamptz not null default now(),
  cree_par    uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  unique (boutique_id, id)
);

comment on table public.arrivages is
  'Les arrivages annoncés d''une boutique (réglage catalogue.precommandes) : leur date prévue et ce qu''ils apportent ; une déclinaison épuisée qu''un arrivage attendu apporte se précommande.';

create table public.arrivage_lignes (
  boutique_id uuid not null references plateforme.boutiques (id) on delete cascade,
  arrivage_id uuid not null,
  variante_id uuid not null,
  quantite    integer not null constraint arrivage_lignes_quantite check (quantite between 1 and 100000),
  primary key (boutique_id, arrivage_id, variante_id),
  foreign key (boutique_id, arrivage_id) references public.arrivages (boutique_id, id) on delete cascade,
  foreign key (boutique_id, variante_id) references public.variantes (boutique_id, id) on delete cascade
);
create index arrivage_lignes_variante_idx on public.arrivage_lignes (boutique_id, variante_id);

create trigger arrivages_updated_at before update on public.arrivages
  for each row execute function private.set_updated_at();
create trigger arrivages_boutique_immuable before update of boutique_id on public.arrivages
  for each row execute function private.boutique_immuable();
create trigger arrivage_lignes_boutique_immuable before update of boutique_id on public.arrivage_lignes
  for each row execute function private.boutique_immuable();

-- L'équipe lit ceux de sa boutique ; un visiteur ne voit aucune ligne (la
-- vitrine lit la date et ce qui reste par public.precommande_vitrine) ;
-- personne n'écrit par l'API.
alter table public.arrivages enable row level security;
alter table public.arrivage_lignes enable row level security;
create policy "arrivages: l'équipe lit ceux de sa boutique"
  on public.arrivages for select using (boutique_id in (select private.mes_boutiques()));
create policy "arrivage_lignes: l'équipe lit ceux de sa boutique"
  on public.arrivage_lignes for select using (boutique_id in (select private.mes_boutiques()));
revoke insert, update, delete, truncate on public.arrivages, public.arrivage_lignes from anon, authenticated;
grant select on public.arrivages, public.arrivage_lignes to anon, authenticated;

-- Une ligne de commande en précommande : l'arrivage qui l'apporte, et quand
-- le stock l'a servie. La commande attend tant qu'une ligne n'est pas servie.
alter table public.commande_lignes
  add column precommande boolean not null default false,
  add column precommande_arrivage_id uuid,
  add column precommande_servie_le timestamptz,
  add constraint commande_lignes_arrivage_fk foreign key (boutique_id, precommande_arrivage_id)
    references public.arrivages (boutique_id, id) on delete set null (precommande_arrivage_id),
  add constraint commande_lignes_precommande check (precommande or (precommande_arrivage_id is null and precommande_servie_le is null));
create index commande_lignes_precommandes_idx on public.commande_lignes (boutique_id, variante_id)
  where precommande and precommande_servie_le is null;

alter table public.commandes add column en_attente_arrivage boolean not null default false;

comment on column public.commandes.en_attente_arrivage is
  'Une ligne en précommande n''est pas encore servie : la commande attend son arrivage, elle ne s''expédie pas.';


-- ---------------------------------------------------------------------
-- 2. Ce qui se précommande encore
-- ---------------------------------------------------------------------
create function private.precommandes_actif(p_boutique_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((private.reglage(p_boutique_id, 'catalogue.precommandes') #>> '{}')::boolean, false)
$$;

-- Ce qui arrive (les arrivages attendus) moins ce qui est déjà précommandé
-- et pas encore servi (les commandes ni annulées ni refusées).
create function private.capacite_precommande(p_boutique_id uuid, p_variante_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0,
    coalesce((select sum(al.quantite) from public.arrivage_lignes al
               join public.arrivages a on a.boutique_id = al.boutique_id and a.id = al.arrivage_id and a.statut = 'attendu'
              where al.boutique_id = p_boutique_id and al.variante_id = p_variante_id), 0)
  - coalesce((select sum(cl.quantite) from public.commande_lignes cl
               join public.commandes c on c.boutique_id = cl.boutique_id and c.id = cl.commande_id
              where cl.boutique_id = p_boutique_id and cl.variante_id = p_variante_id
                and cl.precommande and cl.precommande_servie_le is null
                and c.statut not in ('annulee', 'refusee')), 0))::integer
$$;

-- Ce que la vitrine en dit, pour une déclinaison épuisée : le premier
-- arrivage qui l'apporte (sa date) et ce qui reste à précommander.
create function public.precommande_vitrine(p_boutique_id uuid, p_variante_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when x.reste > 0 then jsonb_build_object('date_prevue', x.date_prevue, 'reste', x.reste) end
    from (select a.date_prevue, private.capacite_precommande(p_boutique_id, p_variante_id) as reste
            from public.arrivage_lignes al
            join public.arrivages a on a.boutique_id = al.boutique_id and a.id = al.arrivage_id and a.statut = 'attendu'
           where private.precommandes_actif(p_boutique_id)
             and al.boutique_id = p_boutique_id and al.variante_id = p_variante_id
           order by a.date_prevue, a.created_at, a.id
           limit 1) x
$$;

revoke execute on function private.precommandes_actif(uuid) from public, anon, authenticated;
revoke execute on function private.capacite_precommande(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.precommande_vitrine(uuid, uuid) from public;
-- La vue publique des produits l'appelle pour chaque déclinaison épuisée.
grant  execute on function public.precommande_vitrine(uuid, uuid) to anon, authenticated, service_role;


-- ---------------------------------------------------------------------
-- 3. Le stock qui monte sert d'abord les précommandes
-- ---------------------------------------------------------------------
-- Dans l'ordre où les commandes ont été passées ; une ligne que le stock ne
-- couvre pas attend la prochaine hausse (celles d'après, plus petites, sont
-- servies si elles tiennent). Appelée par les deux chemins qui font monter
-- le stock — public.mouvement_stock (réception, correction) et la remise en
-- stock d'une commande annulée ou refusée — après qu'ils ont écrit leur
-- mouvement : le journal dit la réception, puis les précommandes servies.
-- Rend le stock qui reste.
create function private.servir_precommandes(p_boutique_id uuid, p_variante_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ligne    record;
  v_stock    integer;
  v_ecriture text := current_setting('skanecom.ecriture_stock', true);
begin
  select v.stock into v_stock from public.variantes v
   where v.boutique_id = p_boutique_id and v.id = p_variante_id
   for update;
  if coalesce(v_stock, 0) <= 0 then
    return v_stock;
  end if;
  for v_ligne in
    select cl.id, cl.commande_id, cl.quantite, c.numero
      from public.commande_lignes cl
      join public.commandes c on c.boutique_id = cl.boutique_id and c.id = cl.commande_id
     where cl.boutique_id = p_boutique_id and cl.variante_id = p_variante_id
       and cl.precommande and cl.precommande_servie_le is null
       and c.statut in ('a_arbitrer', 'recue', 'confirmee')
     order by c.created_at, c.numero, cl.created_at, cl.id
     for update of cl
  loop
    continue when v_ligne.quantite > v_stock;
    perform set_config('skanecom.ecriture_stock', 'on', true);
    update public.variantes set stock = stock - v_ligne.quantite
     where boutique_id = p_boutique_id and id = p_variante_id
    returning stock into v_stock;
    perform set_config('skanecom.ecriture_stock', coalesce(v_ecriture, ''), true);
    insert into public.stock_mouvements
      (boutique_id, variante_id, delta, stock_apres, motif, commande_id, commentaire, auteur_id)
    values (p_boutique_id, p_variante_id, -v_ligne.quantite, v_stock, 'vente', v_ligne.commande_id,
            'Précommande ' || v_ligne.numero, private.auteur());
    update public.commande_lignes set precommande_servie_le = now()
     where boutique_id = p_boutique_id and id = v_ligne.id;
    update public.commandes c
       set en_attente_arrivage = exists (select 1 from public.commande_lignes l
                                          where l.boutique_id = c.boutique_id and l.commande_id = c.id
                                            and l.precommande and l.precommande_servie_le is null)
     where c.boutique_id = p_boutique_id and c.id = v_ligne.commande_id;
  end loop;
  return v_stock;
end;
$$;

-- Une commande qui attend son arrivage ne part pas.
create function private.garde_arrivage()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.en_attente_arrivage and new.statut in ('expediee', 'livree') and new.statut is distinct from old.statut then
    raise exception 'Cette commande attend son arrivage : elle part quand toutes ses pièces sont arrivées'
      using errcode = 'check_violation', hint = 'arrivage';
  end if;
  return new;
end;
$$;
create trigger commandes_garde_arrivage
  before update of statut on public.commandes
  for each row execute function private.garde_arrivage();

revoke execute on function private.servir_precommandes(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.garde_arrivage() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 4. Le backoffice annonce, reçoit, annule
-- ---------------------------------------------------------------------
-- L'écran des arrivages : chacun avec ses déclinaisons, ce qui en est
-- précommandé et pas encore servi ; les précommandes qui attendent encore.
create function public.gestion_arrivages(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return jsonb_build_object(
    'actif', private.precommandes_actif(p_boutique_id),
    'arrivages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'nom', a.nom, 'date_prevue', a.date_prevue, 'note', a.note, 'statut', a.statut,
               'recu_le', a.recu_le, 'cree_le', a.created_at,
               'lignes', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'variante_id', v.id, 'sku', v.sku, 'produit', coalesce(p.nom_fr, p.nom_ar),
                          'libelle', (select string_agg(v.options ->> o.cle, ' · ' order by o.position, o.cle)
                                        from public.produit_options o
                                       where o.boutique_id = v.boutique_id and o.produit_id = v.produit_id and v.options ? o.cle),
                          'quantite', al.quantite, 'stock', v.stock,
                          'precommandees', (select coalesce(sum(cl.quantite), 0)::integer
                                              from public.commande_lignes cl
                                              join public.commandes c on c.boutique_id = cl.boutique_id and c.id = cl.commande_id
                                             where cl.boutique_id = al.boutique_id and cl.precommande_arrivage_id = a.id
                                               and cl.variante_id = v.id and cl.precommande_servie_le is null
                                               and c.statut not in ('annulee', 'refusee')))
                        order by coalesce(p.nom_fr, p.nom_ar), v.position, v.sku)
                   from public.arrivage_lignes al
                   join public.variantes v on v.boutique_id = al.boutique_id and v.id = al.variante_id
                   join public.produits p on p.boutique_id = v.boutique_id and p.id = v.produit_id
                  where al.boutique_id = a.boutique_id and al.arrivage_id = a.id), '[]'::jsonb),
               'commandes', (select count(distinct cl.commande_id)::integer
                               from public.commande_lignes cl
                               join public.commandes c on c.boutique_id = cl.boutique_id and c.id = cl.commande_id
                              where cl.boutique_id = a.boutique_id and cl.precommande_arrivage_id = a.id
                                and cl.precommande_servie_le is null and c.statut not in ('annulee', 'refusee')))
             order by (a.statut = 'attendu') desc, a.date_prevue, a.created_at)
        from public.arrivages a
       where a.boutique_id = p_boutique_id
         and (a.statut = 'attendu' or a.updated_at > now() - interval '60 days')), '[]'::jsonb),
    'en_attente', (select count(*) from public.commandes c
                    where c.boutique_id = p_boutique_id and c.en_attente_arrivage
                      and c.statut in ('a_arbitrer', 'recue', 'confirmee')));
end;
$$;

-- Les lignes d'un arrivage (annoncé ou reçu) : [{variante_id, quantite}],
-- chaque déclinaison une fois, en vente dans la boutique.
create function private.lignes_arrivage(p_boutique_id uuid, p_lignes jsonb)
returns table (variante_id uuid, quantite integer)
language plpgsql
stable
set search_path = ''
as $$
begin
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Indiquez au moins une déclinaison et sa quantité' using errcode = 'check_violation', hint = 'lignes';
  end if;
  if jsonb_array_length(p_lignes) > 500 then
    raise exception 'Au plus 500 déclinaisons par arrivage' using errcode = 'check_violation', hint = 'lignes';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lignes) l
              where coalesce(l ->> 'quantite', '') !~ '^[0-9]{1,6}$'
                 or (l ->> 'quantite')::integer not between 1 and 100000) then
    raise exception 'Une quantité de 1 à 100 000 par déclinaison' using errcode = 'check_violation', hint = 'quantite';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lignes) l
              where coalesce(l ->> 'variante_id', '') !~ '^[0-9a-fA-F-]{36}$'
                 or not exists (select 1 from public.variantes v
                                 where v.boutique_id = p_boutique_id and v.id = (l ->> 'variante_id')::uuid and v.actif)) then
    raise exception 'Déclinaison introuvable, ou retirée de la vente' using errcode = 'no_data_found', hint = 'variante';
  end if;
  if (select count(*) from jsonb_array_elements(p_lignes)) <> (select count(distinct l ->> 'variante_id') from jsonb_array_elements(p_lignes) l) then
    raise exception 'Une déclinaison apparaît deux fois' using errcode = 'check_violation', hint = 'double';
  end if;
  return query select (l ->> 'variante_id')::uuid, (l ->> 'quantite')::integer from jsonb_array_elements(p_lignes) l;
end;
$$;

-- Annoncer un arrivage, ou le changer tant qu'il est attendu.
create function public.gestion_enregistrer_arrivage(
  p_boutique_id uuid,
  p_arrivage_id uuid,
  p_nom         text,
  p_date_prevue date,
  p_lignes      jsonb,
  p_note        text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_nom  text := btrim(coalesce(p_nom, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_a    public.arrivages;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,preparateur}');
  if char_length(v_nom) not between 2 and 60 then
    raise exception 'Le nom de l''arrivage : de 2 à 60 caractères (« Conteneur d''octobre »)' using errcode = 'check_violation', hint = 'nom';
  end if;
  if p_date_prevue is null or p_date_prevue > current_date + 365 then
    raise exception 'La date prévue : dans l''année qui vient' using errcode = 'check_violation', hint = 'date';
  end if;
  if char_length(v_note) > 300 then
    raise exception 'La note compte 300 caractères au plus' using errcode = 'check_violation', hint = 'note';
  end if;
  perform 1 from private.lignes_arrivage(p_boutique_id, p_lignes);

  if p_arrivage_id is null then
    if p_date_prevue < (now() at time zone 'Africa/Tunis')::date then
      raise exception 'Un arrivage s''annonce pour aujourd''hui ou plus tard' using errcode = 'check_violation', hint = 'date';
    end if;
    insert into public.arrivages (boutique_id, nom, date_prevue, note, cree_par)
    values (p_boutique_id, v_nom, p_date_prevue, v_note, auth.uid())
    returning * into v_a;
  else
    select a.* into v_a from public.arrivages a where a.boutique_id = p_boutique_id and a.id = p_arrivage_id for update;
    if not found then
      raise exception 'Cet arrivage n''existe pas dans cette boutique' using errcode = 'check_violation', hint = 'introuvable';
    end if;
    if v_a.statut <> 'attendu' then
      raise exception 'Cet arrivage est déjà reçu ou annulé' using errcode = 'check_violation', hint = 'etat';
    end if;
    update public.arrivages set nom = v_nom, date_prevue = p_date_prevue, note = v_note
     where boutique_id = p_boutique_id and id = v_a.id
    returning * into v_a;
    delete from public.arrivage_lignes where boutique_id = p_boutique_id and arrivage_id = v_a.id;
  end if;
  insert into public.arrivage_lignes (boutique_id, arrivage_id, variante_id, quantite)
  select p_boutique_id, v_a.id, x.variante_id, x.quantite from private.lignes_arrivage(p_boutique_id, p_lignes) x;

  perform private.console_trace(auth.uid(), p_boutique_id, case when p_arrivage_id is null then 'arrivage.annoncer' else 'arrivage.modifier' end,
    v_a.id::text, null, jsonb_build_object('nom', v_a.nom, 'date_prevue', v_a.date_prevue, 'lignes', p_lignes));
  return jsonb_build_object('id', v_a.id, 'nom', v_a.nom);
end;
$$;

-- Réceptionner un arrivage : les quantités vraiment reçues entrent en stock
-- (public.gestion_reception) et servent d'abord les précommandes ;
-- l'arrivage passe reçu. Rend les commandes servies de toutes leurs pièces.
create function public.gestion_recevoir_arrivage(p_boutique_id uuid, p_arrivage_id uuid, p_lignes jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a        public.arrivages;
  v_recu     jsonb;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,preparateur}');
  select a.* into v_a from public.arrivages a where a.boutique_id = p_boutique_id and a.id = p_arrivage_id for update;
  if not found then
    raise exception 'Cet arrivage n''existe pas dans cette boutique' using errcode = 'check_violation', hint = 'introuvable';
  end if;
  if v_a.statut <> 'attendu' then
    raise exception 'Cet arrivage est déjà reçu ou annulé' using errcode = 'check_violation', hint = 'etat';
  end if;
  v_recu := public.gestion_reception(p_boutique_id, p_lignes, 'Arrivage « ' || v_a.nom || ' »');
  update public.arrivages set statut = 'recu', recu_le = now() where boutique_id = p_boutique_id and id = v_a.id;
  perform private.console_trace(auth.uid(), p_boutique_id, 'arrivage.recevoir', v_a.id::text, null,
    jsonb_build_object('nom', v_a.nom, 'pieces', v_recu -> 'pieces'));
  return v_recu || jsonb_build_object(
    'nom', v_a.nom,
    -- Servies pendant cette réception (le même instant de transaction).
    'servies', coalesce((select jsonb_agg(distinct c.numero)
                           from public.commande_lignes cl
                           join public.commandes c on c.boutique_id = cl.boutique_id and c.id = cl.commande_id
                          where cl.boutique_id = p_boutique_id and cl.precommande_servie_le = now()
                            and not c.en_attente_arrivage), '[]'::jsonb),
    'en_attente', (select count(*) from public.commandes c
                    where c.boutique_id = p_boutique_id and c.en_attente_arrivage
                      and c.statut in ('a_arbitrer', 'recue', 'confirmee')));
end;
$$;

-- Annuler un arrivage qui ne viendra pas : plus rien ne s'y précommande ;
-- ce qui l'était attend le prochain stock (ou l'équipe annule la commande).
create function public.gestion_annuler_arrivage(p_boutique_id uuid, p_arrivage_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_a public.arrivages;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,preparateur}');
  select a.* into v_a from public.arrivages a where a.boutique_id = p_boutique_id and a.id = p_arrivage_id for update;
  if not found then
    raise exception 'Cet arrivage n''existe pas dans cette boutique' using errcode = 'check_violation', hint = 'introuvable';
  end if;
  if v_a.statut <> 'attendu' then
    raise exception 'Cet arrivage est déjà reçu ou annulé' using errcode = 'check_violation', hint = 'etat';
  end if;
  update public.arrivages set statut = 'annule' where boutique_id = p_boutique_id and id = v_a.id;
  perform private.console_trace(auth.uid(), p_boutique_id, 'arrivage.annuler', v_a.id::text,
    jsonb_build_object('nom', v_a.nom), null);
  return jsonb_build_object('nom', v_a.nom,
    'en_attente', (select count(distinct cl.commande_id)::integer
                     from public.commande_lignes cl
                     join public.commandes c on c.boutique_id = cl.boutique_id and c.id = cl.commande_id
                    where cl.boutique_id = p_boutique_id and cl.precommande_arrivage_id = v_a.id
                      and cl.precommande_servie_le is null and c.statut not in ('annulee', 'refusee')));
end;
$$;

revoke execute on function private.lignes_arrivage(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.gestion_arrivages(uuid) from public, anon;
revoke execute on function public.gestion_enregistrer_arrivage(uuid, uuid, text, date, jsonb, text) from public, anon;
revoke execute on function public.gestion_recevoir_arrivage(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.gestion_annuler_arrivage(uuid, uuid) from public, anon;
grant  execute on function public.gestion_arrivages(uuid) to authenticated;
grant  execute on function public.gestion_enregistrer_arrivage(uuid, uuid, text, date, jsonb, text) to authenticated;
grant  execute on function public.gestion_recevoir_arrivage(uuid, uuid, jsonb) to authenticated;
grant  execute on function public.gestion_annuler_arrivage(uuid, uuid) to authenticated;


-- ---------------------------------------------------------------------
-- 5. Le chiffrage, la commande, la liste, la fiche et le suivi
--    (fonctions reprises telles quelles : seuls les passages dits changent)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.chiffre_sans_lots(p_boutique_id uuid, p_lignes jsonb, p_gouvernorat text, p_retrait boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lignes      jsonb;
  v_sous_total  bigint;
  v_complet     boolean;
  v_gouv        public.gouvernorats;
  v_frais       bigint;
  v_seuil       bigint := (private.reglage(p_boutique_id, 'livraison.seuil_gratuite_millimes') #>> '{}')::bigint;
  v_zone        jsonb;
  v_retrait     jsonb;
  v_poids       integer;
  v_supplement  bigint := 0;
  v_pro         boolean := private.est_pro(p_boutique_id);
  v_economie    bigint;
  v_designe     text := nullif(current_setting('skanecom.devis_id', true), '');
  v_devis_id    uuid;
  v_devis_frais bigint;
  v_precommandes boolean := private.precommandes_actif(p_boutique_id);
begin
  -- Un devis ne vaut que s'il est envoyé, à son client connecté.
  if v_designe ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select d.id, d.frais_livraison_millimes into v_devis_id, v_devis_frais
      from public.devis d
      join public.clients cl on cl.boutique_id = d.boutique_id and cl.id = d.client_id
     where d.boutique_id = p_boutique_id and d.id = v_designe::uuid and d.statut = 'envoye'
       and cl.user_id = auth.uid() and auth.uid() is not null;
  end if;

  with demandees as (
    select d.variante_id, d.quantite from private.lignes_panier(p_lignes) d
  ), lues as (
    select d.variante_id, d.quantite,
           coalesce(v.actif and p.publie, false) as vendable,
           v.stock, v.sku, p.slug, v.poids_grammes,
           v.prix_millimes as prix_public,
           -- Le prix du devis ; sinon le prix pro, pour un pro (jamais plus
           -- cher que le prix public) ; sinon le prix public.
           case when dl.id is not null then dl.prix_devis_millimes
                when v_pro then least(coalesce(pp.prix_millimes, v.prix_millimes), v.prix_millimes)
                else v.prix_millimes end as prix_millimes,
           coalesce(v.quantite_min, 1) as quantite_min,
           pre.arrivage_id, pre.date_prevue, pre.capacite,
           dl.id is not null as au_devis,
           -- Le palier le plus haut qui ne dépasse pas la quantité (hors devis).
           case when dl.id is null then pal.quantite end as palier,
           case when dl.id is null then pal.prix_millimes end as palier_prix,
           coalesce(p.nom_fr, p.nom_ar) as produit_nom,
           (select string_agg(v.options ->> o.cle, ' · ' order by o.position, o.cle)
              from public.produit_options o
             where o.boutique_id = v.boutique_id and o.produit_id = v.produit_id
               and v.options ? o.cle) as libelle,
           coalesce(v.image_chemin,
             (select i.chemin from public.produit_images i
               where i.boutique_id = v.boutique_id and i.produit_id = v.produit_id
               order by (i.variante_id is not distinct from v.id) desc, i.position, i.created_at
               limit 1)) as image
    from demandees d
    left join public.variantes v on v.boutique_id = p_boutique_id and v.id = d.variante_id
    left join public.produits  p on p.boutique_id = v.boutique_id and p.id = v.produit_id
    left join public.prix_pro pp on pp.boutique_id = v.boutique_id and pp.variante_id = v.id
    left join public.devis_lignes dl on v_devis_id is not null and dl.boutique_id = v.boutique_id
                                     and dl.devis_id = v_devis_id and dl.variante_id = v.id
                                     and dl.quantite = d.quantite and dl.prix_devis_millimes is not null
    left join lateral (
      select q.quantite, q.prix_millimes from public.prix_quantite q
       where q.boutique_id = v.boutique_id and q.produit_id = v.produit_id and q.quantite <= d.quantite
       order by q.quantite desc limit 1
    ) pal on true
    -- Épuisée, la déclinaison se précommande sur le premier arrivage attendu
    -- qui l'apporte (réglage catalogue.precommandes), dans la limite de ce qui reste.
    left join lateral (
      select a.id as arrivage_id, a.date_prevue, private.capacite_precommande(v.boutique_id, v.id) as capacite
        from public.arrivage_lignes al
        join public.arrivages a on a.boutique_id = al.boutique_id and a.id = al.arrivage_id and a.statut = 'attendu'
       where v_precommandes and v.stock < coalesce(v.quantite_min, 1)
         and al.boutique_id = v.boutique_id and al.variante_id = v.id
       order by a.date_prevue, a.created_at, a.id
       limit 1
    ) pre on true
  ), chiffrees as (
    -- Le total de la ligne : au palier, au prorata, s'il est moins cher.
    select l.*,
           (l.vendable and l.arrivage_id is not null and coalesce(l.capacite, 0) >= l.quantite_min) as precommande,
           l.prix_millimes * l.quantite as total_sans_palier,
           least(l.prix_millimes * l.quantite,
                 coalesce(round(l.palier_prix::numeric * l.quantite / l.palier)::bigint, l.prix_millimes * l.quantite)) as total
      from lues l
  )
  select
    jsonb_agg(jsonb_build_object(
      'variante_id',            l.variante_id,
      'disponible',             (l.vendable and l.stock > 0 and l.stock >= l.quantite_min) or l.precommande,
      'quantite',               l.quantite,
      'quantite_disponible',    case when l.precommande then least(l.quantite, l.capacite)
                                     when l.vendable and l.stock >= l.quantite_min then least(l.quantite, l.stock) else 0 end,
      'quantite_min',           case when l.vendable then l.quantite_min end,
      'precommande',            case when l.precommande then jsonb_build_object('arrivage_id', l.arrivage_id, 'date_prevue', l.date_prevue) end,
      'produit_nom',            case when l.vendable then l.produit_nom end,
      'produit_slug',           case when l.vendable then l.slug end,
      'variante_libelle',       case when l.vendable then l.libelle end,
      'sku',                    case when l.vendable then l.sku end,
      'image',                  case when l.vendable then l.image end,
      'prix_unitaire_millimes', case when l.vendable then
                                  case when l.total < l.total_sans_palier then round(l.total::numeric / l.quantite)::bigint
                                       else l.prix_millimes end end,
      'prix_public_millimes',   case when l.vendable and l.prix_millimes < l.prix_public then l.prix_public end,
      'palier',                 case when l.vendable and l.total < l.total_sans_palier then l.palier end,
      'total_sans_palier_millimes', case when l.vendable and l.total < l.total_sans_palier then l.total_sans_palier end,
      'total_ligne_millimes',   case when l.vendable then l.total end
    ) order by l.produit_nom nulls last, l.sku, l.variante_id),
    coalesce(sum(case when l.vendable then l.total end), 0),
    -- Au devis : chaque ligne doit en être (mêmes articles, mêmes quantités).
    bool_and(l.vendable and (l.stock >= l.quantite or (l.precommande and l.capacite >= l.quantite))
             and l.quantite >= l.quantite_min and (v_devis_id is null or l.au_devis)),
    coalesce(sum(case when l.vendable then coalesce(l.poids_grammes, 0) * l.quantite end), 0)::integer,
    coalesce(sum(case when l.vendable then (l.prix_public - l.prix_millimes) * l.quantite end), 0)
  into v_lignes, v_sous_total, v_complet, v_poids, v_economie
  from chiffrees l;

  if p_retrait then
    -- Retrait en magasin : gratuit, au magasin de la boutique.
    v_retrait := private.retrait_propose(p_boutique_id);
    if v_retrait is null then
      raise exception 'Le retrait en magasin n''est pas proposé par cette boutique'
        using errcode = 'check_violation', hint = 'retrait';
    end if;
    v_frais := 0;
  elsif p_gouvernorat is not null then
    select * into v_gouv from public.gouvernorats g where g.code = p_gouvernorat and g.actif;
    if not found then
      raise exception 'Gouvernorat inconnu' using errcode = 'check_violation', hint = 'adresse';
    end if;
    v_frais := public.frais_livraison_millimes(p_boutique_id, v_gouv.code, v_sous_total, v_poids);
    v_supplement := case when v_frais > 0 then private.supplement_poids(p_boutique_id, v_poids) else 0 end;
    select jsonb_build_object('nom_fr', z.nom_fr, 'nom_ar', z.nom_ar,
                              'delai_jours_min', z.delai_jours_min, 'delai_jours_max', z.delai_jours_max)
      into v_zone
      from public.zones_gouvernorats zg
      join public.zones_livraison z on z.boutique_id = zg.boutique_id and z.id = zg.zone_id and z.actif
     where zg.boutique_id = p_boutique_id and zg.gouvernorat_code = v_gouv.code;
  end if;
  -- Les frais fixés par le devis remplacent ceux de la boutique (à domicile).
  if v_devis_id is not null and v_devis_frais is not null and not p_retrait then
    v_frais := v_devis_frais;
    v_supplement := 0;
  end if;

  return jsonb_build_object(
    'lignes',                   v_lignes,
    'complet',                  v_complet,
    'sous_total_millimes',      v_sous_total,
    'seuil_gratuite_millimes',  case when v_seuil > 0 and v_devis_id is null then v_seuil end,
    'gouvernorat',              case when v_gouv.code is not null then
                                  jsonb_build_object('code', v_gouv.code, 'nom_fr', v_gouv.nom_fr, 'nom_ar', v_gouv.nom_ar) end,
    'zone',                     v_zone,
    'mode',                     case when p_retrait then 'retrait' else 'domicile' end,
    'retrait',                  v_retrait,
    'frais_livraison_millimes', v_frais,
    'poids_grammes',            v_poids,
    'supplement_poids_millimes', v_supplement,
    'tarif',                    case when v_devis_id is not null then 'devis' when v_pro then 'pro' else 'public' end,
    'economie_pro_millimes',    case when v_pro and v_devis_id is null and v_economie > 0 then v_economie end,
    'total_millimes',           v_sous_total + v_frais,
    -- Une ligne en précommande : la commande part à l'arrivage le plus tardif.
    'precommande',              (select jsonb_build_object('date_prevue', max((x #>> '{precommande,date_prevue}')::date))
                                   from jsonb_array_elements(coalesce(v_lignes, '[]'::jsonb)) x
                                  where jsonb_typeof(x -> 'precommande') = 'object'
                                 having count(*) > 0)
  );
end;
$function$;

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
     prix_unitaire_millimes, quantite, total_ligne_millimes, lot_id, lot_nom, remise_lot_millimes,
     precommande, precommande_arrivage_id)
  select p_boutique_id, v_commande.id, (l ->> 'variante_id')::uuid, l ->> 'produit_nom', l ->> 'variante_libelle',
         l ->> 'sku', (l ->> 'prix_unitaire_millimes')::bigint, (l ->> 'quantite')::integer,
         (l ->> 'total_ligne_millimes')::bigint, (l ->> 'lot_id')::uuid, l ->> 'lot',
         coalesce((l ->> 'remise_lot_millimes')::bigint, 0),
         coalesce(jsonb_typeof(l -> 'precommande') = 'object', false), (l #>> '{precommande,arrivage_id}')::uuid
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
  -- Au comptoir, le client repart avec ses articles : pas de pièce en précommande.
  if v_mode = 'comptoir' and exists (select 1 from jsonb_array_elements(v_devis -> 'lignes') x
                                      where jsonb_typeof(x -> 'precommande') = 'object') then
    raise exception 'Une pièce en précommande n''est pas encore arrivée : elle ne se remet pas au comptoir'
      using errcode = 'check_violation', hint = 'precommande';
  end if;
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
     prix_unitaire_millimes, quantite, total_ligne_millimes, lot_id, lot_nom, remise_lot_millimes,
     precommande, precommande_arrivage_id)
  select p_boutique_id, v_commande.id, (l ->> 'variante_id')::uuid, l ->> 'produit_nom', l ->> 'variante_libelle',
         l ->> 'sku', (l ->> 'prix_unitaire_millimes')::bigint, (l ->> 'quantite')::integer,
         (l ->> 'total_ligne_millimes')::bigint, (l ->> 'lot_id')::uuid, l ->> 'lot',
         coalesce((l ->> 'remise_lot_millimes')::bigint, 0),
         coalesce(jsonb_typeof(l -> 'precommande') = 'object', false), (l #>> '{precommande,arrivage_id}')::uuid
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

CREATE OR REPLACE FUNCTION private.reserve_stock_ligne()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_stock_apres integer;
  v_numero      text;
  v_ecriture    text := current_setting('skanecom.ecriture_stock', true);
begin
  if new.variante_id is null then
    return new;   -- ligne libre (produit retiré du catalogue) : rien à réserver
  end if;
  -- En précommande : rien à réserver, la commande attend son arrivage
  -- (private.servir_precommandes lui donnera le stock à la réception).
  if new.precommande then
    update public.commandes set en_attente_arrivage = true
     where boutique_id = new.boutique_id and id = new.commande_id;
    return new;
  end if;

  -- L'UPDATE verrouille la variante : deux clients qui commandent la
  -- dernière pièce en même temps sont sérialisés ici. La clé composite de la
  -- ligne garantit que la variante est de la même boutique.
  perform set_config('skanecom.ecriture_stock', 'on', true);
  update public.variantes
     set stock = stock - new.quantite
   where boutique_id = new.boutique_id and id = new.variante_id
     and stock >= new.quantite
  returning stock into v_stock_apres;
  perform set_config('skanecom.ecriture_stock', coalesce(v_ecriture, ''), true);

  if v_stock_apres is null then
    raise exception 'Stock insuffisant pour la variante % (quantité demandée : %)',
      new.variante_id, new.quantite
      using errcode = 'check_violation';
  end if;

  select c.numero into v_numero
  from public.commandes c where c.boutique_id = new.boutique_id and c.id = new.commande_id;

  insert into public.stock_mouvements
    (boutique_id, variante_id, delta, stock_apres, motif, commande_id, commentaire, auteur_id)
  values (new.boutique_id, new.variante_id, -new.quantite, v_stock_apres, 'vente', new.commande_id,
          'Commande ' || coalesce(v_numero, '?'), private.auteur());

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.mouvement_stock(p_boutique_id uuid, p_variante_id uuid, p_delta integer, p_motif motif_mouvement_stock, p_commentaire text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_stock    integer;
  v_ecriture text := current_setting('skanecom.ecriture_stock', true);
begin
  if not (private.est_membre(p_boutique_id, '{proprietaire,admin,preparateur}')
          or auth.role() = 'service_role') then
    raise exception 'Mouvement de stock refusé : rôle insuffisant dans cette boutique'
      using errcode = 'insufficient_privilege';
  end if;
  if p_motif not in ('reception', 'correction', 'casse') then
    raise exception 'Le motif % est réservé aux commandes', p_motif
      using errcode = 'check_violation';
  end if;

  perform set_config('skanecom.ecriture_stock', 'on', true);
  update public.variantes
     set stock = stock + p_delta
   where boutique_id = p_boutique_id and id = p_variante_id
  returning stock into v_stock;
  perform set_config('skanecom.ecriture_stock', coalesce(v_ecriture, ''), true);

  if v_stock is null then
    raise exception 'Variante introuvable dans cette boutique' using errcode = 'no_data_found';
  end if;

  insert into public.stock_mouvements (boutique_id, variante_id, delta, stock_apres, motif, commentaire, auteur_id)
  values (p_boutique_id, p_variante_id, p_delta, v_stock, p_motif, p_commentaire, auth.uid());

  -- Une hausse sert d'abord les précommandes (après son mouvement au journal).
  if p_delta > 0 then
    v_stock := private.servir_precommandes(p_boutique_id, p_variante_id);
  end if;
  return v_stock;
end;
$function$;

CREATE OR REPLACE FUNCTION private.reintegre_stock_commande()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ligne    record;
  v_stock    integer;
  v_motif    public.motif_mouvement_stock;
  v_ecriture text := current_setting('skanecom.ecriture_stock', true);
begin
  if new.statut not in ('refusee', 'annulee') then return new; end if;
  if old.statut in ('refusee', 'annulee') then return new; end if;
  if new.stock_reintegre then return new; end if;

  v_motif := case when new.statut = 'refusee' then 'retour_refus' else 'annulation' end;

  for v_ligne in
    select l.variante_id, l.quantite from public.commande_lignes l
    where l.boutique_id = new.boutique_id and l.commande_id = new.id and l.variante_id is not null
      and not (l.precommande and l.precommande_servie_le is null)
  loop
    perform set_config('skanecom.ecriture_stock', 'on', true);
    update public.variantes
       set stock = stock + v_ligne.quantite
     where boutique_id = new.boutique_id and id = v_ligne.variante_id
    returning stock into v_stock;
    perform set_config('skanecom.ecriture_stock', coalesce(v_ecriture, ''), true);

    insert into public.stock_mouvements
      (boutique_id, variante_id, delta, stock_apres, motif, commande_id, commentaire, auteur_id)
    values (new.boutique_id, v_ligne.variante_id, v_ligne.quantite, v_stock, v_motif, new.id,
            'Commande ' || new.numero || ' — ' || new.statut::text, private.auteur());
    perform private.servir_precommandes(new.boutique_id, v_ligne.variante_id);
  end loop;

  update public.commandes set stock_reintegre = true, en_attente_arrivage = false
   where boutique_id = new.boutique_id and id = new.id;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gestion_liste_commandes(p_boutique_id uuid, p_etape text DEFAULT 'a_confirmer'::text, p_recherche text DEFAULT NULL::text, p_limite integer DEFAULT 50, p_decalage integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_etape    text := coalesce(nullif(p_etape, ''), 'a_confirmer');
  v_q        text := nullif(btrim(p_recherche), '');
  v_chiffres text := regexp_replace(coalesce(p_recherche, ''), '\D', '', 'g');
  v_statuts  public.statut_commande[];
  v_limite   integer := least(greatest(coalesce(p_limite, 50), 1), 100);
  v_decalage integer := greatest(coalesce(p_decalage, 0), 0);
  v_fifo     boolean := coalesce(nullif(p_etape, ''), 'a_confirmer') in ('a_confirmer', 'a_preparer', 'expediees', 'precommandes');
  v_resultat jsonb;
begin
  if auth.uid() is null or not private.est_membre(p_boutique_id) then
    raise exception 'Réservé à l''équipe de la boutique' using errcode = 'insufficient_privilege', hint = 'role';
  end if;
  v_statuts := case v_etape
    when 'a_confirmer' then '{a_arbitrer,recue}'
    when 'a_preparer'  then '{confirmee}'
    when 'precommandes' then '{a_arbitrer,recue,confirmee}'
    when 'expediees'   then '{expediee}'
    when 'cloturees'   then '{livree,refusee,annulee}'
    when 'toutes'      then '{a_arbitrer,recue,confirmee,expediee,livree,refusee,annulee}'
  end::public.statut_commande[];
  if v_statuts is null then
    raise exception 'Étape inconnue : %', v_etape using errcode = 'check_violation', hint = 'canal';
  end if;

  with choisies as (
    select c.*
    from public.commandes c
    where c.boutique_id = p_boutique_id
      and c.statut = any (v_statuts)
      and (v_etape <> 'a_preparer' or not c.en_attente_arrivage)
      and (v_etape <> 'precommandes' or c.en_attente_arrivage)
      and (v_q is null
           or c.numero ilike '%' || v_q || '%'
           or c.contact_nom ilike '%' || v_q || '%'
           or (char_length(v_chiffres) >= 3 and c.contact_telephone like '%' || v_chiffres || '%'))
  ), page as (
    select * from choisies
    order by
      case when v_fifo then created_at end asc, case when v_fifo then numero end asc,
      case when not v_fifo then created_at end desc, case when not v_fifo then numero end desc
    limit v_limite offset v_decalage
  )
  select jsonb_build_object(
    'etape', v_etape,
    'total', (select count(*) from choisies),
    'compteurs', (
      select jsonb_build_object(
        'a_confirmer', count(*) filter (where c.statut in ('a_arbitrer', 'recue')),
        'a_preparer',  count(*) filter (where c.statut = 'confirmee' and not c.en_attente_arrivage),
        'precommandes', count(*) filter (where c.en_attente_arrivage and c.statut in ('a_arbitrer', 'recue', 'confirmee')),
        'expediees',   count(*) filter (where c.statut = 'expediee'),
        'cloturees',   count(*) filter (where c.statut in ('livree', 'refusee', 'annulee')))
      from public.commandes c where c.boutique_id = p_boutique_id),
    'commandes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero', p.numero, 'statut', p.statut, 'cree_le', p.created_at,
        'contact_nom', p.contact_nom, 'contact_telephone', p.contact_telephone,
        'mode_livraison', p.mode_livraison, 'ville', p.livraison_ville, 'gouvernorat', coalesce(g.nom_fr, p.livraison_gouvernorat),
        'total_millimes', p.total_millimes, 'origine', p.origine,
        'arrivage_prevu', case when p.en_attente_arrivage then (
                            select max(a.date_prevue) from public.commande_lignes l
                              join public.arrivages a on a.boutique_id = l.boutique_id and a.id = l.precommande_arrivage_id
                             where l.boutique_id = p.boutique_id and l.commande_id = p.id
                               and l.precommande and l.precommande_servie_le is null) end,
        'articles', (select coalesce(sum(l.quantite), 0) from public.commande_lignes l
                     where l.boutique_id = p.boutique_id and l.commande_id = p.id),
        'premier_article', (select l.produit_nom from public.commande_lignes l
                            where l.boutique_id = p.boutique_id and l.commande_id = p.id
                            order by l.created_at, l.produit_nom limit 1),
        'appels', (select count(*) from public.confirmations k
                   where k.boutique_id = p.boutique_id and k.commande_id = p.id),
        'dernier_appel', (select k.resultat from public.confirmations k
                          where k.boutique_id = p.boutique_id and k.commande_id = p.id
                          order by k.created_at desc limit 1),
        'client', case when cl.id is null then null else jsonb_build_object(
                    'nb_commandes', cl.nb_commandes, 'nb_refus', cl.nb_refus,
                    'niveau_risque', cl.niveau_risque, 'compte', cl.user_id is not null) end
      ) order by
          case when v_fifo then p.created_at end asc, case when v_fifo then p.numero end asc,
          case when not v_fifo then p.created_at end desc, case when not v_fifo then p.numero end desc)
      from page p
      left join public.gouvernorats g on g.code = p.livraison_gouvernorat
      left join public.clients cl on cl.boutique_id = p.boutique_id and cl.id = p.client_id
    ), '[]'::jsonb)
  ) into v_resultat;

  return v_resultat;
end;
$function$;

CREATE OR REPLACE FUNCTION public.gestion_aujourdhui(p_boutique_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_jour      date := (now() at time zone 'Africa/Tunis')::date;
  v_debut     timestamptz := (v_jour::timestamp) at time zone 'Africa/Tunis';
  v_direction boolean;
begin
  perform private.catalogue_exige(p_boutique_id);
  v_direction := private.est_membre(p_boutique_id, '{proprietaire,admin,lecture}');

  return jsonb_build_object(
    'jour', v_jour,
    'direction', v_direction,

    -- Ce qui attend un geste : le compte, et depuis quand.
    'commandes', (
      select jsonb_build_object(
        'a_confirmer',  count(*) filter (where c.statut in ('a_arbitrer', 'recue')),
        -- Le dernier appel n'a pas abouti : injoignable, ou « rappeler ».
        'a_rappeler',   count(*) filter (where c.statut = 'recue' and (
                          select k.resultat from public.confirmations k
                           where k.boutique_id = c.boutique_id and k.commande_id = c.id
                           order by k.created_at desc limit 1) in ('injoignable', 'rappeler')),
        'attente_depuis', min(c.created_at) filter (where c.statut in ('a_arbitrer', 'recue')),
        'a_preparer',   count(*) filter (where c.statut = 'confirmee' and not c.en_attente_arrivage),
        'precommandes', count(*) filter (where c.en_attente_arrivage),
        'en_livraison', count(*) filter (where c.statut = 'expediee' and c.mode_livraison = 'domicile'),
        -- En route depuis plus de cinq jours : à suivre avec le transporteur.
        'en_retard',    count(*) filter (where c.statut = 'expediee' and c.mode_livraison = 'domicile'
                                           and c.expediee_at < now() - interval '5 days'),
        'retraits_prets', count(*) filter (where c.statut = 'expediee' and c.mode_livraison = 'retrait'))
        from public.commandes c
       where c.boutique_id = p_boutique_id and c.statut in ('a_arbitrer', 'recue', 'confirmee', 'expediee')),

    -- La journée (depuis minuit, heure de Tunis).
    'journee', (
      select jsonb_build_object(
        'recues',   count(*) filter (where c.created_at >= v_debut and c.statut <> 'a_arbitrer'),
        'livrees',  count(*) filter (where c.statut = 'livree' and c.livree_at >= v_debut),
        'refusees', count(*) filter (where c.statut = 'refusee' and c.cloturee_at >= v_debut),
        'recues_millimes',  case when v_direction then coalesce(sum(c.total_millimes)
                              filter (where c.created_at >= v_debut and c.statut not in ('a_arbitrer', 'annulee')), 0) end,
        'livrees_millimes', case when v_direction then coalesce(sum(c.total_millimes)
                              filter (where c.statut = 'livree' and c.livree_at >= v_debut), 0) end)
        from public.commandes c
       where c.boutique_id = p_boutique_id
         and (c.created_at >= v_debut or c.livree_at >= v_debut or c.cloturee_at >= v_debut)),

    -- Ce que les modules actifs demandent (null : module absent).
    'modules', jsonb_build_object(
      'sav',         case when private.sav_actif(p_boutique_id) then
                       (select count(*) from public.sav_demandes s where s.boutique_id = p_boutique_id and s.statut = 'nouvelle') end,
      'devis',       case when private.devis_actif(p_boutique_id) then
                       (select count(*) from public.devis d where d.boutique_id = p_boutique_id and d.statut = 'demande') end,
      'avis',        case when private.avis_actif(p_boutique_id) then
                       (select count(*) from public.avis a where a.boutique_id = p_boutique_id and a.statut = 'en_attente') end,
      'comptes_pro', case when private.comptes_pro_actif(p_boutique_id) then
                       (select count(*) from public.comptes_pro cp where cp.boutique_id = p_boutique_id and cp.statut = 'demande') end),

    -- Les pièces en vente épuisées ou sous leur seuil d'alerte ; les six
    -- plus urgentes (épuisées d'abord, puis le moins de stock).
    'stock', (
      with pieces as (
        select v.id, v.sku, v.stock, v.seuil_alerte_stock, p.id as produit_id, coalesce(p.nom_fr, p.nom_ar) as produit,
               private.libelle_variante(p_boutique_id, p.id, v.options) as declinaison
          from public.variantes v
          join public.produits p on p.boutique_id = v.boutique_id and p.id = v.produit_id and p.publie
         where v.boutique_id = p_boutique_id and v.actif and v.stock <= v.seuil_alerte_stock)
      select jsonb_build_object(
        'ruptures', (select count(*) from pieces where stock <= 0),
        'bas',      (select count(*) from pieces where stock > 0),
        'pieces',   coalesce((select jsonb_agg(jsonb_build_object(
                                 'produit_id', x.produit_id, 'produit', x.produit, 'declinaison', x.declinaison,
                                 'sku', x.sku, 'stock', x.stock, 'seuil', x.seuil_alerte_stock) order by x.stock, x.produit, x.sku)
                                from (select * from pieces order by stock, produit, sku limit 6) x), '[]'::jsonb)))
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.gestion_expedier_lot(p_boutique_id uuid, p_numeros text[], p_transporteur text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    if not found or v_commande.statut <> 'confirmee' or v_commande.mode_livraison <> 'domicile' or v_commande.en_attente_arrivage then
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
    'en_attente_arrivage', c.en_attente_arrivage,
    'arrivage_prevu', case when c.en_attente_arrivage then (select max(a.date_prevue) from public.commande_lignes l2
                         join public.arrivages a on a.boutique_id = l2.boutique_id and a.id = l2.precommande_arrivage_id
                        where l2.boutique_id = c.boutique_id and l2.commande_id = c.id
                          and l2.precommande and l2.precommande_servie_le is null) end,
    'confirmee_le', c.confirmee_at, 'expediee_le', c.expediee_at, 'livree_le', c.livree_at, 'cloturee_le', c.cloturee_at,
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'produit_nom', l.produit_nom, 'variante_libelle', l.variante_libelle, 'sku', l.sku,
               'quantite', l.quantite, 'prix_unitaire_millimes', l.prix_unitaire_millimes,
               'total_ligne_millimes', l.total_ligne_millimes, 'lot', l.lot_nom, 'remise_lot_millimes', l.remise_lot_millimes, 'stock_restant', v.stock,
               'precommande', l.precommande, 'precommande_servie_le', l.precommande_servie_le,
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
    'arrivage_prevu',           case when c.en_attente_arrivage then (select max(a.date_prevue) from public.commande_lignes l2
                         join public.arrivages a on a.boutique_id = l2.boutique_id and a.id = l2.precommande_arrivage_id
                        where l2.boutique_id = c.boutique_id and l2.commande_id = c.id
                          and l2.precommande and l2.precommande_servie_le is null) end,
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'produit_nom', l.produit_nom, 'variante_libelle', l.variante_libelle, 'sku', l.sku,
               'quantite', l.quantite, 'prix_unitaire_millimes', l.prix_unitaire_millimes,
               'total_ligne_millimes', l.total_ligne_millimes, 'lot', l.lot_nom, 'remise_lot_millimes', l.remise_lot_millimes,
               'precommande', l.precommande and l.precommande_servie_le is null,
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

CREATE OR REPLACE FUNCTION private.commande_pour_acheteur(p_boutique_id uuid, p_commande_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'numero',         c.numero,
    'statut',         c.statut,
    'cree_le',        c.created_at,
    'mode_livraison', c.mode_livraison,
    'ville',          case when c.mode_livraison = 'domicile' then c.livraison_ville end,
    'gouvernorat',    case when c.mode_livraison = 'domicile' then coalesce(g.nom_fr, c.livraison_gouvernorat) end,
    'magasin',        case when c.mode_livraison = 'retrait' then private.magasin(c.boutique_id) end,
    'total_millimes', c.total_millimes,
    'transporteur',   c.transporteur,
    'numero_suivi',   c.numero_suivi,
    'expediee_le',    c.expediee_at,
    'livree_le',      c.livree_at,
    'arrivage_prevu', case when c.en_attente_arrivage then (select max(a.date_prevue) from public.commande_lignes l2
                         join public.arrivages a on a.boutique_id = l2.boutique_id and a.id = l2.precommande_arrivage_id
                        where l2.boutique_id = c.boutique_id and l2.commande_id = c.id
                          and l2.precommande and l2.precommande_servie_le is null) end,
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'produit_nom', l.produit_nom, 'variante_libelle', l.variante_libelle, 'quantite', l.quantite,
               'precommande', l.precommande and l.precommande_servie_le is null,
               'image', coalesce(v.image_chemin,
                 (select i.chemin from public.produit_images i
                   where i.boutique_id = v.boutique_id and i.produit_id = v.produit_id
                   order by (i.variante_id is not distinct from v.id) desc, i.position, i.created_at
                   limit 1)))
             order by l.created_at, l.produit_nom)
        from public.commande_lignes l
        left join public.variantes v on v.boutique_id = l.boutique_id and v.id = l.variante_id
       where l.boutique_id = c.boutique_id and l.commande_id = c.id), '[]'::jsonb))
  from public.commandes c
  left join public.gouvernorats g on g.code = c.livraison_gouvernorat
  where c.boutique_id = p_boutique_id and c.id = p_commande_id;
$function$;

create or replace view public.vitrine_produits
with (security_invoker = true) as
 SELECT boutique_id,
    id,
    slug,
    nom_fr,
    nom_ar,
    description_fr,
    description_ar,
    marque,
    mis_en_avant,
    "position",
    created_at,
    meta_titre_fr,
    meta_description_fr,
    ( SELECT jsonb_build_object('id', c.id, 'parent_id', c.parent_id, 'slug', c.slug, 'nom_fr', c.nom_fr, 'nom_ar', c.nom_ar) AS jsonb_build_object
           FROM categories c
          WHERE c.boutique_id = p.boutique_id AND c.id = p.categorie_id AND c.actif) AS categorie,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('cle', o.cle, 'label_fr', o.label_fr, 'label_ar', o.label_ar) ORDER BY o."position", o.cle) AS jsonb_agg
           FROM produit_options o
          WHERE o.boutique_id = p.boutique_id AND o.produit_id = p.id), '[]'::jsonb) AS options,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('id', v.id, 'sku', v.sku, 'options', v.options, 'prix_millimes', v.prix_millimes, 'prix_barre_millimes', v.prix_barre_millimes, 'stock', v.stock, 'seuil_alerte_stock', v.seuil_alerte_stock, 'poids_grammes', v.poids_grammes, 'image_chemin', v.image_chemin, 'quantite_min', v.quantite_min, 'precommande', CASE WHEN v.stock < COALESCE(v.quantite_min, 1) THEN public.precommande_vitrine(v.boutique_id, v.id) ELSE NULL::jsonb END) ORDER BY v."position", v.sku) AS jsonb_agg
           FROM variantes v
          WHERE v.boutique_id = p.boutique_id AND v.produit_id = p.id AND v.actif), '[]'::jsonb) AS variantes,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('chemin', i.chemin, 'variante_id', i.variante_id, 'alt_fr', i.alt_fr, 'alt_ar', i.alt_ar) ORDER BY i."position", i.chemin) AS jsonb_agg
           FROM produit_images i
          WHERE i.boutique_id = p.boutique_id AND i.produit_id = p.id), '[]'::jsonb) AS images,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('cle', a.cle, 'label_fr', a.label_fr, 'label_ar', a.label_ar, 'unite', a.unite, 'type', a.type, 'en_carte', a.en_carte, 'valeur', p.caracteristiques ->> a.cle) ORDER BY a."position", a.label_fr) AS jsonb_agg
           FROM attributs a
          WHERE a.boutique_id = p.boutique_id AND p.caracteristiques ? a.cle), '[]'::jsonb) AS caracteristiques,
    note_produit(boutique_id, id) AS note,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('quantite', q.quantite, 'prix_millimes', q.prix_millimes) ORDER BY q.quantite) AS jsonb_agg
           FROM prix_quantite q
          WHERE q.boutique_id = p.boutique_id AND q.produit_id = p.id), '[]'::jsonb) AS paliers
   FROM produits p
  WHERE publie;
