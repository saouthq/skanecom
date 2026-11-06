-- =====================================================================
-- LES FOURNISSEURS — ceux dont la plateforme dépend, essayés pour de vrai.
--
-- L'État technique disait si un secret est posé ; il ne disait pas si le
-- fournisseur l'accepte encore. Chaque heure (le passage de la surveillance)
-- et à la demande, un appel inoffensif à chacun — les e-mails (Resend ou
-- Brevo), les SMS (Twilio), SkanFact, Konnect, Cloudflare — dit s'il répond,
-- en combien de temps, et sinon pourquoi (clé refusée, injoignable). Le
-- dernier essai de chacun est gardé ici ; la console le montre.
-- =====================================================================

create table plateforme.fournisseurs_essais (
  cle       text primary key check (cle in ('courriels', 'sms', 'skanfact', 'konnect', 'cloudflare')),
  mode      text not null check (mode in ('reel', 'local', 'apercu', 'aucun')),
  ok        boolean,
  duree_ms  integer check (duree_ms >= 0),
  detail    text check (char_length(detail) <= 300),
  le        timestamptz not null default now(),
  -- Le dernier essai réussi (une panne dit depuis quand ça ne répond plus).
  dernier_ok_le timestamptz
);
alter table plateforme.fournisseurs_essais enable row level security;
-- Aucune politique : seules les fonctions ci-dessous y touchent.

comment on table plateforme.fournisseurs_essais is
  'Le dernier essai de chaque fournisseur (e-mails, SMS, SkanFact, Konnect, Cloudflare) : son mode, s''il répond, en combien de temps, pourquoi sinon.';

-- L'application note les essais d'un tour (clé service_role).
create function public.fournisseurs_noter(p_essais jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e jsonb;
  n integer := 0;
begin
  for e in select * from jsonb_array_elements(coalesce(p_essais, '[]'::jsonb)) loop
    insert into plateforme.fournisseurs_essais (cle, mode, ok, duree_ms, detail, le, dernier_ok_le)
    values (e ->> 'cle', e ->> 'mode', (e ->> 'ok')::boolean, (e ->> 'duree_ms')::integer,
            left(nullif(btrim(coalesce(e ->> 'detail', '')), ''), 300), now(),
            case when (e ->> 'ok')::boolean then now() end)
    on conflict (cle) do update
      set mode = excluded.mode, ok = excluded.ok, duree_ms = excluded.duree_ms, detail = excluded.detail, le = now(),
          dernier_ok_le = case when excluded.ok then now() else plateforme.fournisseurs_essais.dernier_ok_le end;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.fournisseurs_noter(jsonb) from public, anon, authenticated;
grant  execute on function public.fournisseurs_noter(jsonb) to service_role;

create function public.console_fournisseurs(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  return coalesce((select jsonb_object_agg(f.cle, jsonb_build_object('mode', f.mode, 'ok', f.ok, 'duree_ms', f.duree_ms,
                                                                      'detail', f.detail, 'le', f.le, 'dernier_ok_le', f.dernier_ok_le))
                     from plateforme.fournisseurs_essais f), '{}'::jsonb);
end;
$$;
revoke execute on function public.console_fournisseurs(uuid) from public, anon, authenticated;
grant  execute on function public.console_fournisseurs(uuid) to service_role;

-- Un essai lancé depuis la console : au journal.
create function public.console_tracer_fournisseurs(p_acteur uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  perform private.console_trace(p_acteur, null, 'plateforme.fournisseurs_essayes', null, null, null);
end;
$$;
revoke execute on function public.console_tracer_fournisseurs(uuid) from public, anon, authenticated;
grant  execute on function public.console_tracer_fournisseurs(uuid) to service_role;
