-- =====================================================================
-- LES E-MAILS DE COMMANDE — deux réglages de la boutique, coupés par défaut
--
-- · « E-mails au client » : à chaque étape de sa commande (reçue,
--   confirmée, expédiée, livrée, annulée), s'il a une adresse — celle de
--   son compte (vérifiée par un code), ou, pour une commande saisie par
--   l'équipe, celle que l'équipe a notée. Jamais pour une vente au comptoir.
-- · « Prévenir l'équipe » : chaque commande passée sur la vitrine part au
--   propriétaire et aux administrateurs de la boutique.
--
-- Comme pour SkanFact : un déclencheur sur les commandes met l'e-mail dans
-- une file (public.courriels_commandes) ; l'application la vide après la
-- commande et après chaque geste du backoffice (l'adresse et le contenu
-- sont lus à l'envoi : la commande telle qu'elle est). Un envoi qui
-- échoue est retenté, cinq fois au plus.
-- =====================================================================

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('commande.courriels_client', 'booleen', null, 'false', 'commande', null, false,
     'E-mails au client',
     'Oui = le client reçoit un e-mail à chaque étape de sa commande (reçue, confirmée, expédiée, livrée, annulée), s''il a une adresse : celle de son compte, ou celle que l''équipe a notée. Non = rien ne part ; le suivi reste sur la vitrine.', 6),
  ('commande.courriel_equipe', 'booleen', null, 'false', 'commande', null, false,
     'Prévenir l''équipe par e-mail',
     'Oui = chaque commande passée sur la vitrine part par e-mail au propriétaire et aux administrateurs de la boutique. Non = l''équipe la voit dans le backoffice.', 7);

create table public.courriels_commandes (
  id             bigint generated always as identity primary key,
  boutique_id    uuid not null references plateforme.boutiques (id) on delete cascade,
  commande_id    uuid not null,
  evenement      text not null check (evenement in ('recue', 'confirmee', 'expediee', 'livree', 'annulee', 'equipe')),
  etat           text not null default 'a_envoyer' check (etat in ('a_envoyer', 'fait', 'refuse', 'sans_adresse')),
  essais         integer not null default 0 check (essais >= 0),
  prochain_essai timestamptz not null default now(),
  erreur         text check (char_length(erreur) <= 600),
  cree_le        timestamptz not null default now(),
  fait_le        timestamptz,
  unique (commande_id, evenement),
  unique (boutique_id, id),
  foreign key (boutique_id, commande_id) references public.commandes (boutique_id, id) on delete cascade
);
create index courriels_commandes_file_idx on public.courriels_commandes (etat, prochain_essai);
create trigger courriels_commandes_boutique_immuable before update of boutique_id on public.courriels_commandes
  for each row execute function private.boutique_immuable();
-- La file ne se lit qu'avec la clé de service : aucune policy, aucune écriture pour les sessions.
alter table public.courriels_commandes enable row level security;
revoke insert, update, delete, truncate on public.courriels_commandes from anon, authenticated;

comment on table public.courriels_commandes is
  'Les e-mails de commande à envoyer (au client, à l''équipe) : remplie par le déclencheur commandes_courriels, vidée par l''application.';

create function private.courriels_suivre_commande()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evenement text;
begin
  if tg_op = 'UPDATE' and new.statut = old.statut then
    return new;
  end if;
  -- Une vente au comptoir : le client est là, il repart avec.
  if new.sur_place then
    return new;
  end if;
  if coalesce((private.reglage(new.boutique_id, 'commande.courriels_client'))::boolean, false) then
    v_evenement := case new.statut::text
      when 'recue' then 'recue' when 'a_arbitrer' then 'recue' when 'confirmee' then 'confirmee'
      when 'expediee' then 'expediee' when 'livree' then 'livree' when 'annulee' then 'annulee' end;
    if v_evenement is not null then
      insert into public.courriels_commandes (boutique_id, commande_id, evenement)
      values (new.boutique_id, new.id, v_evenement)
      on conflict (commande_id, evenement) do nothing;
    end if;
  end if;
  if tg_op = 'INSERT' and new.origine = 'vitrine'
     and coalesce((private.reglage(new.boutique_id, 'commande.courriel_equipe'))::boolean, false) then
    insert into public.courriels_commandes (boutique_id, commande_id, evenement)
    values (new.boutique_id, new.id, 'equipe')
    on conflict (commande_id, evenement) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function private.courriels_suivre_commande() from public, anon, authenticated;

create trigger commandes_courriels after insert or update of statut on public.commandes
  for each row execute function private.courriels_suivre_commande();

-- ---------------------------------------------------------------------
-- Vider la file (l'application, avec la clé de service)
-- ---------------------------------------------------------------------
-- Prend jusqu'à p_limite e-mails dus (d'une boutique, ou de toutes) et les
-- réserve deux minutes ; rend pour chacun ce qu'il faut pour l'écrire :
-- la boutique, la commande telle qu'elle est, ses lignes, les adresses.
-- Sans adresse : marqué « sans_adresse », et non rendu.
create function public.courriels_commandes_file(p_boutique_id uuid default null, p_limite integer default 10)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_e      public.courriels_commandes;
  v_c      public.commandes;
  v_a      text[];
  v_sortie jsonb := '[]'::jsonb;
begin
  for v_e in
    select * from public.courriels_commandes e
     where e.etat = 'a_envoyer' and e.prochain_essai <= now()
       and (p_boutique_id is null or e.boutique_id = p_boutique_id)
     order by e.id
     limit least(greatest(coalesce(p_limite, 10), 1), 50)
     for update skip locked
  loop
    select * into v_c from public.commandes c where c.id = v_e.commande_id;
    if v_e.evenement = 'equipe' then
      select array_agg(distinct u.email) into v_a
        from plateforme.membres m join auth.users u on u.id = m.user_id
       where m.boutique_id = v_e.boutique_id and m.actif and m.role in ('proprietaire', 'admin') and u.email is not null;
    else
      -- L'adresse du compte (vérifiée par un code) ; pour une commande saisie
      -- par l'équipe, celle qu'elle a notée.
      select array_remove(array[coalesce(
               (select u.email from public.clients cl join auth.users u on u.id = cl.user_id where cl.id = v_c.client_id),
               case when v_c.origine = 'manuelle' then v_c.contact_email end)], null) into v_a;
    end if;
    if coalesce(cardinality(v_a), 0) = 0 then
      update public.courriels_commandes set etat = 'sans_adresse', fait_le = now() where id = v_e.id;
      continue;
    end if;
    update public.courriels_commandes set essais = essais + 1, prochain_essai = now() + interval '2 minutes' where id = v_e.id;
    v_sortie := v_sortie || jsonb_build_object(
      'id', v_e.id,
      'evenement', v_e.evenement,
      'a', to_jsonb(v_a),
      'boutique', (select jsonb_build_object('id', b.id, 'slug', b.slug, 'nom', b.nom) from plateforme.boutiques b where b.id = v_e.boutique_id),
      'commande', jsonb_build_object(
        'numero', v_c.numero, 'statut', v_c.statut, 'origine', v_c.origine, 'mode_paiement', v_c.mode_paiement,
        'mode_livraison', v_c.mode_livraison, 'contact_nom', v_c.contact_nom, 'contact_telephone', v_c.contact_telephone,
        'livraison', jsonb_build_object('ligne1', v_c.livraison_ligne1, 'ligne2', v_c.livraison_ligne2, 'ville', v_c.livraison_ville,
                                        'gouvernorat', coalesce((select g.nom_fr from public.gouvernorats g where g.code = v_c.livraison_gouvernorat), v_c.livraison_gouvernorat),
                                        'code_postal', v_c.livraison_code_postal),
        'sous_total_millimes', v_c.sous_total_millimes, 'frais_livraison_millimes', v_c.frais_livraison_millimes,
        'remise_millimes', v_c.remise_millimes, 'total_millimes', v_c.total_millimes, 'code_promo', v_c.code_promo,
        'transporteur', v_c.transporteur, 'numero_suivi', v_c.numero_suivi, 'motif_annulation', v_c.motif_annulation,
        'cree_le', v_c.created_at),
      'lignes', coalesce((
        select jsonb_agg(jsonb_build_object('nom', l.produit_nom, 'detail', l.variante_libelle, 'quantite', l.quantite,
                                            'total_millimes', l.total_ligne_millimes, 'lot', l.lot_nom, 'precommande', l.precommande)
                         order by l.created_at, l.id)
          from public.commande_lignes l where l.commande_id = v_c.id), '[]'::jsonb));
  end loop;
  return v_sortie;
end;
$$;
revoke execute on function public.courriels_commandes_file(uuid, integer) from public, anon, authenticated;
grant  execute on function public.courriels_commandes_file(uuid, integer) to service_role;

-- Le résultat d'un envoi. Échoué : retenté plus tard, cinq fois au plus.
create function public.courriels_commandes_noter(p_id bigint, p_ok boolean, p_erreur text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.courriels_commandes e
     set etat = case when p_ok then 'fait' when e.essais >= 5 then 'refuse' else 'a_envoyer' end,
         fait_le = case when p_ok or e.essais >= 5 then now() end,
         erreur = case when p_ok then null else left(p_erreur, 600) end,
         prochain_essai = case when p_ok then e.prochain_essai else now() + make_interval(mins => 5 * e.essais) end
   where e.id = p_id;
end;
$$;
revoke execute on function public.courriels_commandes_noter(bigint, boolean, text) from public, anon, authenticated;
grant  execute on function public.courriels_commandes_noter(bigint, boolean, text) to service_role;
