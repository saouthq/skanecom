-- =====================================================================
-- TURNSTILE — l'anti-robots de Cloudflare devant les codes par SMS.
--
-- Un robot qui fait partir des SMS en rafale coûte (chaque SMS est payé).
-- Quand la plateforme a ses clés Turnstile, la vitrine vérifie le visiteur
-- au moment où elle annonce le numéro (/compte/code-sms) ; l'annonce le
-- garde. Le crochet des SMS (/crochets/sms) refuse alors un code dont
-- l'annonce n'a pas été vérifiée — y compris un appel fait directement à
-- Supabase Auth, sans passer par la vitrine. Sans clés : rien ne change.
-- =====================================================================

alter table plateforme.sms_annonces add column verifiee boolean not null default false;
comment on column plateforme.sms_annonces.verifiee is
  'Le visiteur a passé la vérification anti-robots (Turnstile) en annonçant ce numéro.';

drop function public.vitrine_annoncer_sms(uuid, text);
create function public.vitrine_annoncer_sms(p_boutique_id uuid, p_telephone text, p_verifiee boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_empreinte text := private.empreinte_telephone(p_telephone);
begin
  if v_empreinte is null or not exists (select 1 from plateforme.boutiques b where b.id = p_boutique_id and b.statut <> 'fermee') then
    return;
  end if;
  insert into plateforme.sms_annonces (empreinte, boutique_id, verifiee) values (v_empreinte, p_boutique_id, coalesce(p_verifiee, false))
  on conflict (empreinte) do update set boutique_id = excluded.boutique_id, verifiee = excluded.verifiee, le = now();
  delete from plateforme.sms_annonces where le < now() - interval '15 minutes';
end;
$$;
revoke execute on function public.vitrine_annoncer_sms(uuid, text, boolean) from public, anon, authenticated;
grant  execute on function public.vitrine_annoncer_sms(uuid, text, boolean) to service_role;

/** La boutique qui a demandé un code pour ce numéro dans le quart d'heure
 *  ({ id, nom, verifiee }, ou null) ; l'annonce est consommée. */
create or replace function public.console_boutique_du_sms(p_telephone text)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  with lue as (
    delete from plateforme.sms_annonces a
     where a.empreinte = private.empreinte_telephone(p_telephone) and a.le >= now() - interval '15 minutes'
    returning a.boutique_id, a.verifiee
  )
  select jsonb_build_object('id', b.id, 'nom', b.nom, 'verifiee', lue.verifiee) from lue join plateforme.boutiques b on b.id = lue.boutique_id
$$;
