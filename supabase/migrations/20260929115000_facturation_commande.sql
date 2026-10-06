-- =====================================================================
-- SkanEcom — LA FACTURE AU NOM D'UNE SOCIÉTÉ
-- =====================================================================
-- Un acheteur professionnel veut sa facture au nom de sa société : la
-- raison sociale, le matricule fiscal, et l'adresse de facturation quand
-- ce n'est pas celle de la livraison. Il la demande au tunnel (réglage
-- commande.facture_societe, coupé par défaut : « fais les deux et
-- mets-le en réglage ») ; l'équipe peut aussi la noter, ou la corriger,
-- depuis la fiche de la commande (une demande faite au téléphone).
--
-- Gardée sur la commande (commandes.facturation) ; SkanFact la reçoit
-- comme client de la facture (raison sociale, matricule, adresse — le
-- contrat ne permet rien d'autre). Une facture déjà émise dans SkanFact
-- ne se corrige plus d'ici : c'est dans SkanFact.
-- =====================================================================

insert into plateforme.reglages_catalogue
  (cle, type_valeur, choix_possibles, defaut, groupe, module, public, libelle_fr, description_fr, position) values
  ('commande.facture_societe', 'booleen', null, 'false', 'commande', null, true,
     'Facture au nom d''une société',
     'Oui = au moment de commander, l''acheteur peut demander une facture au nom de sa société (raison sociale, matricule fiscal, adresse de facturation). Non = la facture est au nom de la personne qui commande.', 8);

insert into plateforme.droits (code, genre, reglage, module, groupe, libelle_fr, description_fr, position) values
  ('commande.facture_societe', 'reglage', 'commande.facture_societe', null, 'vendre', 'Facture au nom d''une société',
   'La raison sociale et le matricule fiscal demandés au tunnel.', 70)
on conflict do nothing;
insert into plateforme.formule_droits (formule, droit)
select f, 'commande.facture_societe' from unnest(array['pro', 'complete']) f
where exists (select 1 from plateforme.formules x where x.code = f)
on conflict do nothing;

alter table public.commandes add column facturation jsonb
  constraint commandes_facturation_forme check (
    facturation is null or (jsonb_typeof(facturation) = 'object'
      and char_length(coalesce(facturation ->> 'raison_sociale', '')) between 2 and 120
      and char_length(coalesce(facturation ->> 'matricule_fiscal', '')) between 8 and 30));
comment on column public.commandes.facturation is
  'La facture au nom d''une société : {raison_sociale, matricule_fiscal, adresse: {ligne1, ville, code_postal} | null}. NULL : au nom de la personne qui commande.';


-- ---------------------------------------------------------------------
-- Lire et vérifier ce que l'acheteur (ou l'équipe) a tapé
-- ---------------------------------------------------------------------
-- Rend la forme rangée, ou refuse en disant quel champ (hint : le champ).
create function public.facturation_lisible(p_facturation jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_raison text := btrim(regexp_replace(coalesce(p_facturation ->> 'raison_sociale', ''), '\s+', ' ', 'g'));
  v_matricule text := upper(btrim(regexp_replace(coalesce(p_facturation ->> 'matricule_fiscal', ''), '\s+', ' ', 'g')));
  v_adresse jsonb := p_facturation -> 'adresse';
  v_ligne1 text;
  v_ville text;
  v_cp text;
begin
  if p_facturation is null or jsonb_typeof(p_facturation) <> 'object' then
    raise exception 'La facture : la raison sociale et le matricule fiscal' using errcode = 'check_violation', hint = 'facturation';
  end if;
  if char_length(v_raison) not between 2 and 120 then
    raise exception 'La raison sociale de la société, telle qu''elle doit paraître sur la facture'
      using errcode = 'check_violation', hint = 'facturation';
  end if;
  -- Le matricule fiscal tunisien : sept chiffres (huit pour les plus récents),
  -- la lettre de contrôle, puis le code de TVA, la catégorie et l'établissement
  -- (1234567A/M/000). Les séparateurs s'écrivent comme on veut.
  if char_length(v_matricule) > 30 or regexp_replace(v_matricule, '[^A-Z0-9]', '', 'g') !~ '^[0-9]{7,8}[A-Z][A-Z0-9]{0,8}$' then
    raise exception 'Le matricule fiscal : sept chiffres et une lettre, puis le reste (par exemple 1234567A/M/000)'
      using errcode = 'check_violation', hint = 'facturation';
  end if;
  if v_adresse is not null and jsonb_typeof(v_adresse) = 'object' then
    v_ligne1 := btrim(coalesce(v_adresse ->> 'ligne1', ''));
    v_ville := btrim(coalesce(v_adresse ->> 'ville', ''));
    v_cp := nullif(btrim(coalesce(v_adresse ->> 'code_postal', '')), '');
    if v_ligne1 = '' and v_ville = '' and v_cp is null then
      v_adresse := null;
    elsif char_length(v_ligne1) not between 3 and 200 or char_length(v_ville) not between 2 and 80 then
      raise exception 'L''adresse de facturation : la rue et la ville' using errcode = 'check_violation', hint = 'facturation';
    elsif v_cp is not null and v_cp !~ '^[0-9]{4}$' then
      raise exception 'Le code postal de facturation : quatre chiffres' using errcode = 'check_violation', hint = 'facturation';
    else
      v_adresse := jsonb_build_object('ligne1', v_ligne1, 'ville', v_ville, 'code_postal', v_cp);
    end if;
  else
    v_adresse := null;
  end if;
  return jsonb_build_object('raison_sociale', v_raison, 'matricule_fiscal', v_matricule, 'adresse', v_adresse);
end;
$$;


-- ---------------------------------------------------------------------
-- La vitrine : demander la facture avec la commande (son numéro et son
-- jeton, que seul le serveur de la vitrine tient), une fois.
-- ---------------------------------------------------------------------
create function public.vitrine_demander_facture(p_boutique_id uuid, p_numero text, p_jeton text, p_facturation jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_f jsonb;
  v_id uuid;
begin
  if not coalesce((private.reglage(p_boutique_id, 'commande.facture_societe'))::boolean, false) then
    raise exception 'Cette boutique ne fait pas de facture au nom d''une société depuis la vitrine'
      using errcode = 'check_violation', hint = 'facturation';
  end if;
  v_f := public.facturation_lisible(p_facturation);
  update public.commandes c set facturation = v_f
   where c.boutique_id = p_boutique_id and c.numero = p_numero
     and c.jeton_suivi_hash = sha256(convert_to(coalesce(p_jeton, ''), 'UTF8'))
     and c.facturation is null and c.statut not in ('annulee', 'refusee')
  returning c.id into v_id;
  return v_id is not null;
end;
$$;

-- Ce que la page de fin et le suivi disent de la facture.
create function public.vitrine_facturation(p_boutique_id uuid, p_numero text, p_jeton text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select c.facturation from public.commandes c
   where c.boutique_id = p_boutique_id and c.numero = p_numero
     and c.jeton_suivi_hash = sha256(convert_to(coalesce(p_jeton, ''), 'UTF8'));
$$;


-- ---------------------------------------------------------------------
-- Le backoffice : lire (et ce que propose le compte pro du client),
-- noter ou corriger, retirer.
-- ---------------------------------------------------------------------
create function public.gestion_facturation(p_boutique_id uuid, p_numero text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.commandes;
begin
  if auth.uid() is null or not private.est_membre(p_boutique_id) then
    raise exception 'Réservé à l''équipe de la boutique' using errcode = 'insufficient_privilege', hint = 'role';
  end if;
  select * into v from public.commandes c where c.boutique_id = p_boutique_id and c.numero = p_numero;
  if v.id is null then
    raise exception 'Commande introuvable : %', p_numero using errcode = 'no_data_found', hint = 'commande';
  end if;
  return jsonb_build_object(
    'facturation', v.facturation,
    'reglage', coalesce((private.reglage(p_boutique_id, 'commande.facture_societe'))::boolean, false),
    -- Le compte pro validé du client : de quoi remplir d'un geste.
    'compte_pro', (select jsonb_build_object('raison_sociale', cp.raison_sociale, 'matricule_fiscal', cp.matricule_fiscal)
                     from public.comptes_pro cp
                    where cp.boutique_id = p_boutique_id and cp.client_id = v.client_id and cp.statut = 'valide'),
    -- Déjà émise dans SkanFact : elle se corrige là-bas.
    'facturee', exists (select 1 from public.skanfact_envois e
                         where e.boutique_id = p_boutique_id and e.commande_id = v.id and e.genre = 'facture' and e.etat = 'fait'));
end;
$$;

create function public.gestion_regler_facturation(p_boutique_id uuid, p_numero text, p_facturation jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_commande public.commandes;
  v_f jsonb;
begin
  v_commande := private.commande_a_gerer(p_boutique_id, p_numero, '{proprietaire,admin,confirmateur}', null);
  if exists (select 1 from public.skanfact_envois e
              where e.boutique_id = p_boutique_id and e.commande_id = v_commande.id and e.genre = 'facture' and e.etat = 'fait') then
    raise exception 'La facture est déjà émise dans SkanFact : corrigez-la dans SkanFact'
      using errcode = 'check_violation', hint = 'facturee';
  end if;
  v_f := case when p_facturation is null or p_facturation = 'null'::jsonb then null else public.facturation_lisible(p_facturation) end;
  if v_f is not distinct from v_commande.facturation then
    return v_f;
  end if;
  update public.commandes c set facturation = v_f where c.boutique_id = p_boutique_id and c.id = v_commande.id;
  -- Une facture jamais encore envoyée à SkanFact partira avec le bon client
  -- (un envoi déjà tenté garde son corps : il ne doit pas changer d'un essai à l'autre).
  update public.skanfact_envois e set corps = null
   where e.boutique_id = p_boutique_id and e.commande_id = v_commande.id and e.genre = 'facture'
     and e.etat = 'a_envoyer' and e.essais = 0;
  perform private.console_trace(auth.uid(), p_boutique_id, 'commande.facturation', p_numero, v_commande.facturation, v_f);
  return v_f;
end;
$$;


-- ---------------------------------------------------------------------
-- SkanFact : le client de la facture, la société quand elle est demandée
-- (sinon, comme avant : le compte pro validé, puis la personne).
-- ---------------------------------------------------------------------
create or replace function public.skanfact_file(p_boutique_id uuid, p_numero text default null)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'connexion', jsonb_build_object('entreprise', c.entreprise, 'cle_chiffree', c.cle_chiffree, 'tva_produits', c.tva_produits,
                                    'tva_livraison', c.tva_livraison),
    'jour', (now() at time zone 'Africa/Tunis')::date,
    'envois', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'genre', e.genre, 'cle', e.cle, 'corps', e.corps, 'essais', e.essais, 'motif', e.motif,
        'facture', (select jsonb_build_object('etat', f.etat, 'corps', f.corps) from public.skanfact_envois f
                     where f.boutique_id = e.boutique_id and f.commande_id = e.commande_id and f.genre = 'facture' and f.etat <> 'annule'),
        -- Un paiement à part (B3) : la facture ne le porte pas.
        'paiement_a_part', exists (select 1 from public.skanfact_envois p where p.boutique_id = e.boutique_id and p.commande_id = e.commande_id
                                    and p.genre = 'paiement' and p.etat <> 'annule'),
        'commande', jsonb_build_object(
          'id', k.id, 'numero', k.numero, 'statut', k.statut, 'mode_paiement', k.mode_paiement, 'statut_paiement', k.statut_paiement,
          'client_id', k.client_id, 'nom', k.contact_nom, 'telephone', k.contact_telephone, 'email', k.contact_email,
          'adresse', case when k.facturation -> 'adresse' is not null and jsonb_typeof(k.facturation -> 'adresse') = 'object'
                       then concat_ws(', ', k.facturation #>> '{adresse,ligne1}', k.facturation #>> '{adresse,code_postal}', k.facturation #>> '{adresse,ville}')
                       else concat_ws(', ', k.livraison_ligne1, k.livraison_ligne2, k.livraison_code_postal, k.livraison_ville, k.livraison_gouvernorat) end,
          'matricule', coalesce(k.facturation ->> 'matricule_fiscal',
                                (select cp.matricule_fiscal from public.comptes_pro cp
                                  where cp.boutique_id = k.boutique_id and cp.client_id = k.client_id and cp.statut = 'valide')),
          'raison_sociale', coalesce(k.facturation ->> 'raison_sociale',
                                     (select cp.raison_sociale from public.comptes_pro cp
                                       where cp.boutique_id = k.boutique_id and cp.client_id = k.client_id and cp.statut = 'valide')),
          'frais', k.frais_livraison_millimes, 'remise', k.remise_millimes, 'total', k.total_millimes),
        'lignes', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'designation', concat_ws(' — ', l.produit_nom, nullif(btrim(l.variante_libelle), '')),
                                                                'code', nullif(btrim(l.sku), ''), 'quantite', l.quantite,
                                                                'prix', l.prix_unitaire_millimes, 'total', l.total_ligne_millimes)
                                              order by l.created_at, l.produit_nom, l.variante_libelle, l.id)
                              from public.commande_lignes l where l.boutique_id = k.boutique_id and l.commande_id = k.id), '[]'::jsonb),
        'sav_ligne', (select s.ligne_id from public.sav_demandes s where s.id = e.sav_id))
      order by e.cree_le, case e.genre when 'facture' then 0 when 'paiement' then 1 else 2 end, e.id)
      from public.skanfact_envois e join public.commandes k on k.boutique_id = e.boutique_id and k.id = e.commande_id
     where e.boutique_id = p_boutique_id and e.etat = 'a_envoyer' and e.entreprise = c.entreprise
       and e.prochain_essai <= now() and (p_numero is null or k.numero = p_numero)), '[]'::jsonb))
  from plateforme.skanfact_connexions c
  where c.boutique_id = p_boutique_id and c.etat = 'connectee' and c.tva_produits is not null and c.tva_livraison is not null
    and private.skanfact_actif(p_boutique_id);
$$;


-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
revoke execute on function public.facturation_lisible(jsonb) from public;
grant  execute on function public.facturation_lisible(jsonb) to anon, authenticated, service_role;
revoke execute on function public.vitrine_demander_facture(uuid, text, text, jsonb) from public;
revoke execute on function public.vitrine_facturation(uuid, text, text) from public;
grant  execute on function public.vitrine_demander_facture(uuid, text, text, jsonb) to anon, authenticated;
grant  execute on function public.vitrine_facturation(uuid, text, text) to anon, authenticated;
revoke execute on function public.gestion_facturation(uuid, text) from public, anon;
revoke execute on function public.gestion_regler_facturation(uuid, text, jsonb) from public, anon;
grant  execute on function public.gestion_facturation(uuid, text) to authenticated;
grant  execute on function public.gestion_regler_facturation(uuid, text, jsonb) to authenticated;
