-- =====================================================================
-- SkanEcom — LE DOMAINE D'UNE BOUTIQUE : LE BRANCHER, OU L'ACHETER
-- =====================================================================
-- Demandé par Skander (l'étape « Domaine » de l'assistant). Trois cas :
--   · le domaine que le commerçant possède déjà (un .tn acheté chez un
--     registrar tunisien) : branché chez Cloudflare (Cloudflare for SaaS),
--     les enregistrements à poser gardés ici, son état relu ;
--   · une adresse provisoire de la plateforme (<identifiant>.skanecom.tn),
--     pour préparer la boutique avant d'avoir son domaine ;
--   · un domaine acheté d'un geste (Cloudflare Registrar), tracé avec son
--     prix au journal.
-- L'application parle à Cloudflare ; la base garde ce qui a été dit.
-- =====================================================================

alter table plateforme.domaines
  add column branchement jsonb,
  add column branche_le  timestamptz;

comment on column plateforme.domaines.branchement is
  'Chez Cloudflare (nom personnalisé) : {ref, statut a_poser|actif|refuse, enregistrements [{type, nom, valeur, role}], erreurs}. NULL : jamais branché (local, adresse provisoire).';

-- La création prend le genre du domaine : le sien (personnalisé) ou
-- l'adresse provisoire de la plateforme (sous-domaine).
drop function public.console_creer_boutique(uuid, text, text, text, text, text);
create function public.console_creer_boutique(
  p_acteur uuid,
  p_slug   text,
  p_nom    text,
  p_hote   text,
  p_theme  text default 'editorial',
  p_langue text default 'fr',
  p_type   text default 'personnalise'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_hote text := lower(btrim(p_hote));
begin
  perform private.console_exige_admin(p_acteur);
  if btrim(coalesce(p_nom, '')) = '' then
    raise exception 'Le nom de la boutique est obligatoire' using errcode = 'check_violation';
  end if;
  if p_type not in ('personnalise', 'sous_domaine') then
    raise exception 'Genre de domaine inconnu' using errcode = '22023';
  end if;
  if exists (select 1 from plateforme.domaines d where d.hote = v_hote) then
    raise exception 'Le domaine % mène déjà à une autre boutique', v_hote using errcode = 'unique_violation', hint = 'hote';
  end if;

  insert into plateforme.boutiques (slug, nom, langue_defaut, langues_actives)
  values (lower(btrim(p_slug)), btrim(p_nom), p_langue, array[p_langue])
  returning id into v_id;

  insert into plateforme.domaines (hote, boutique_id, type, principal)
  values (v_hote, v_id, p_type::plateforme.type_domaine, true);

  insert into public.themes (boutique_id, code, updated_by)
  values (v_id, p_theme, p_acteur);

  perform private.console_trace(p_acteur, v_id, 'boutique.creer', lower(btrim(p_slug)), null,
    jsonb_build_object('nom', btrim(p_nom), 'hote', v_hote, 'type', p_type, 'theme', p_theme, 'langue', p_langue));
  return v_id;
end;
$$;

-- Ce que Cloudflare a répondu pour un domaine (branché, relu).
create function public.console_noter_branchement(p_acteur uuid, p_hote text, p_branchement jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_d plateforme.domaines;
  v_statut text := p_branchement ->> 'statut';
begin
  perform private.console_exige_admin(p_acteur);
  select * into v_d from plateforme.domaines d where d.hote = lower(btrim(p_hote));
  if v_d.hote is null then
    raise exception 'Domaine inconnu' using errcode = 'no_data_found';
  end if;
  if v_statut not in ('a_poser', 'actif', 'refuse') then
    raise exception 'État de branchement inconnu' using errcode = '22023';
  end if;
  update plateforme.domaines d
     set branchement = p_branchement,
         branche_le = coalesce(d.branche_le, now()),
         statut_certificat = case v_statut when 'actif' then 'actif' when 'refuse' then 'erreur' else d.statut_certificat end
   where d.hote = v_d.hote;
  if v_d.branchement is null or v_d.branchement ->> 'statut' is distinct from v_statut then
    perform private.console_trace(p_acteur, v_d.boutique_id, 'boutique.domaine_branche', v_d.hote,
      case when v_d.branchement is null then null else jsonb_build_object('statut', v_d.branchement ->> 'statut') end,
      jsonb_build_object('statut', v_statut));
  end if;
end;
$$;

-- Un achat d'un geste : le domaine (et son prix) au journal, puis branché comme un autre.
create function public.console_noter_achat(p_acteur uuid, p_boutique_id uuid, p_nom text, p_prix text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  if not exists (select 1 from plateforme.administrateurs a where a.user_id = p_acteur and a.role = 'super_admin') then
    raise exception 'Un achat de domaine est réservé au super-administrateur' using errcode = '42501';
  end if;
  perform private.console_trace(p_acteur, p_boutique_id, 'boutique.domaine_achete', lower(btrim(p_nom)), null,
    jsonb_build_object('prix', p_prix));
end;
$$;

-- Les domaines d'une boutique et leur branchement (la carte Domaines de sa fiche).
create function public.console_branchements(p_acteur uuid, p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  return coalesce((select jsonb_agg(jsonb_build_object('hote', d.hote, 'type', d.type, 'principal', d.principal,
                                                       'branchement', d.branchement, 'branche_le', d.branche_le)
                                    order by d.principal desc, d.hote)
                     from plateforme.domaines d where d.boutique_id = p_boutique_id), '[]'::jsonb);
end;
$$;

revoke execute on function public.console_creer_boutique(uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.console_branchements(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.console_branchements(uuid, uuid) to service_role;
revoke execute on function public.console_noter_branchement(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.console_noter_achat(uuid, uuid, text, text) from public, anon, authenticated;
grant  execute on function public.console_creer_boutique(uuid, text, text, text, text, text, text) to service_role;
grant  execute on function public.console_noter_branchement(uuid, text, jsonb) to service_role;
grant  execute on function public.console_noter_achat(uuid, uuid, text, text) to service_role;
