-- =====================================================================
-- SkanEcom — 82 · UNE CLÉ OUBLIÉE EST AUSSI COUPÉE DANS SKANFACT
-- =====================================================================
--
-- Brique 135 de SkanFact (docs/boutique.md, B0 point 6). « Déconnecter »
-- oubliait la clé chez SkanEcom, mais SkanFact la gardait valable un an
-- (le commerçant voyait deux « SkanEcom (connexion) » dans ses Services
-- connectés). Désormais, toute clé que la boutique quitte — déconnectée,
-- remplacée par une reconnexion ou un renouvellement — entre dans une file
-- de COUPURES : le serveur de l'application la fait couper chez SkanFact
-- (POST /v1/partenaires/skanecom/deconnecter, le secret de SkanEcom).
-- La boutique, elle, l'a déjà oubliée : le commerçant n'attend jamais
-- SkanFact. SkanFact en panne : la coupure se renvoie plus tard (1 min,
-- 5 min, 30 min, 2 h, puis toutes les 6 h), la même clé, sans risque
-- (redemander donne la même réponse).
-- Une clé refusée par SkanFact (401 : coupée dans SkanFact, ou expirée)
-- n'y entre pas : elle ne vaut déjà plus rien.
-- =====================================================================

create table plateforme.skanfact_coupures (
  id             uuid primary key default gen_random_uuid(),
  -- Sans clé étrangère : une boutique supprimée laisse sa clé à couper
  -- (le contexte du chiffrement, lui, reste son identifiant).
  boutique_id    uuid not null,
  cle_chiffree   text not null check (char_length(cle_chiffree) between 20 and 2000),
  essais         integer not null default 0 check (essais >= 0),
  prochain_essai timestamptz not null default now(),
  erreur         text check (char_length(erreur) <= 600),
  cree_le        timestamptz not null default now()
);
create index skanfact_coupures_dues_idx on plateforme.skanfact_coupures (boutique_id, prochain_essai);

comment on table plateforme.skanfact_coupures is
  'Les clés SkanFact que des boutiques ont quittées (déconnectées, remplacées), à faire couper dans SkanFact (brique 135) ; une ligne disparaît quand SkanFact a répondu.';

alter table plateforme.skanfact_coupures enable row level security;
revoke all on plateforme.skanfact_coupures from public, anon, authenticated;

-- La clé que la connexion quitte entre dans la file (déconnectée, ou remplacée par une nouvelle).
create function private.skanfact_cle_quittee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.cle_chiffree is not null then
      insert into plateforme.skanfact_coupures (boutique_id, cle_chiffree) values (old.boutique_id, old.cle_chiffree);
    end if;
    return old;
  end if;
  -- Une nouvelle clé (reconnexion, renouvellement, autre entreprise) : l'ancienne se coupe.
  -- Coupée par SkanFact (401) : rien à couper, elle ne vaut déjà plus rien.
  if old.cle_chiffree is not null and new.cle_chiffree is distinct from old.cle_chiffree and new.etat = 'connectee' then
    insert into plateforme.skanfact_coupures (boutique_id, cle_chiffree) values (old.boutique_id, old.cle_chiffree);
  end if;
  return new;
end;
$$;

create trigger skanfact_connexions_cle_quittee before update of cle_chiffree or delete on plateforme.skanfact_connexions
  for each row execute function private.skanfact_cle_quittee();

-- L'état, pour la navigation : les coupures dues comptent parmi ce qui doit partir.
create or replace function public.gestion_skanfact_etat(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id);
  return (
    select jsonb_build_object(
      'actif', private.skanfact_actif(p_boutique_id),
      'connecte', c.boutique_id is not null,
      'coupee', coalesce(c.etat = 'coupee', false),
      'expire_bientot', coalesce(c.etat = 'connectee' and c.expire_le < now() + interval '30 days', false),
      'a_regler', c.boutique_id is not null and (c.tva_produits is null or c.tva_livraison is null),
      'a_envoyer', (select count(*) from public.skanfact_envois e where e.boutique_id = p_boutique_id and e.etat = 'a_envoyer'),
      'dus', (select count(*) from public.skanfact_envois e where e.boutique_id = p_boutique_id and e.etat = 'a_envoyer'
                and e.prochain_essai <= now() and e.entreprise = c.entreprise and c.etat = 'connectee')
             + (select count(*) from plateforme.skanfact_coupures k where k.boutique_id = p_boutique_id and k.prochain_essai <= now()),
      'refuses', (select count(*) from public.skanfact_envois e where e.boutique_id = p_boutique_id and e.etat = 'refuse'))
    from (select 1) x left join plateforme.skanfact_connexions c on c.boutique_id = p_boutique_id);
end;
$$;

-- « Renvoyer maintenant » avance aussi les coupures qui attendent SkanFact.
create or replace function public.gestion_skanfact_avancer(p_boutique_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
  v_k integer;
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,confirmateur,preparateur}');
  update public.skanfact_envois e set prochain_essai = now()
   where e.boutique_id = p_boutique_id and e.etat = 'a_envoyer' and e.prochain_essai > now();
  get diagnostics v_n = row_count;
  update plateforme.skanfact_coupures k set prochain_essai = now()
   where k.boutique_id = p_boutique_id and k.prochain_essai > now();
  get diagnostics v_k = row_count;
  return v_n + v_k;
end;
$$;

-- Pour la page SkanFact (la direction) : les anciens accès qui attendent d'être coupés dans SkanFact.
create function public.gestion_skanfact_coupures(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.catalogue_exige(p_boutique_id, '{proprietaire,admin,lecture}');
  return coalesce((select jsonb_agg(jsonb_build_object('essais', k.essais, 'prochain_essai', k.prochain_essai, 'erreur', k.erreur,
                                                       'cree_le', k.cree_le) order by k.cree_le)
                     from plateforme.skanfact_coupures k where k.boutique_id = p_boutique_id), '[]'::jsonb);
end;
$$;

-- Le serveur prend les coupures dues d'une boutique (deux minutes à lui seul, un essai compté).
create function public.skanfact_prendre_coupures(p_boutique_id uuid)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  with prises as (
    update plateforme.skanfact_coupures k
       set essais = k.essais + 1, prochain_essai = now() + interval '2 minutes'
     where k.boutique_id = p_boutique_id and k.prochain_essai <= now()
    returning k.id, k.cle_chiffree
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'cle_chiffree', p.cle_chiffree)), '[]'::jsonb) from prises p;
$$;

-- Ce que SkanFact a répondu : coupée (ou inconnue de lui : rien à couper), ou à renvoyer plus tard.
create function public.skanfact_noter_coupure(p_id uuid, p_resultat text, p_erreur text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_resultat is null or p_resultat not in ('fait', 'plus_tard') then
    raise exception 'Résultat inconnu : %', p_resultat using errcode = 'check_violation';
  end if;
  if p_resultat = 'fait' then
    delete from plateforme.skanfact_coupures k where k.id = p_id;
    return;
  end if;
  update plateforme.skanfact_coupures k
     set erreur = left(p_erreur, 600),
         prochain_essai = now() + (array[interval '1 minute', interval '5 minutes', interval '30 minutes', interval '2 hours'])[least(greatest(k.essais, 1), 4)]
                                + case when k.essais > 4 then interval '4 hours' else interval '0' end
   where k.id = p_id;
end;
$$;

revoke execute on function private.skanfact_cle_quittee() from public, anon, authenticated;
revoke execute on function public.gestion_skanfact_coupures(uuid) from public, anon;
revoke execute on function public.skanfact_prendre_coupures(uuid) from public, anon, authenticated;
revoke execute on function public.skanfact_noter_coupure(uuid, text, text) from public, anon, authenticated;
grant  execute on function public.gestion_skanfact_coupures(uuid) to authenticated, service_role;
grant  execute on function public.skanfact_prendre_coupures(uuid) to service_role;
grant  execute on function public.skanfact_noter_coupure(uuid, text, text) to service_role;
