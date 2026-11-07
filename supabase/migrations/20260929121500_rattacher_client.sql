-- =====================================================================
-- LA FICHE SANS COMPTE, RETROUVÉE À LA CONNEXION (07/11, parcours en vrai)
-- =====================================================================
-- Une commande saisie par l'équipe (au téléphone, au comptoir) ou passée
-- sans compte (réglage « invité ») crée une fiche client sans compte, au
-- numéro de la personne. Connectée plus tard avec ce numéro (vérifié par un
-- code SMS), elle lisait « Aucune commande pour le moment. Les commandes
-- passées avec ce numéro s'afficheront ici » — rien ne s'affichait ; et sa
-- première commande avec compte ouvrait une seconde fiche au même numéro,
-- l'historique (les refus) partagé entre deux fiches au backoffice.
--
-- Désormais, à la connexion, la plus ancienne fiche sans compte au numéro
-- VÉRIFIÉ du compte lui est rattachée — si le compte n'a pas encore de fiche
-- dans la boutique. Le code SMS prouve le numéro ; une adresse e-mail, elle,
-- n'est rapprochée de rien (celle d'une fiche a pu être tapée par l'équipe).
-- =====================================================================

create function public.rattacher_mon_client(p_boutique_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tel text;
  v_id  uuid;
begin
  if v_uid is null then
    return false;
  end if;
  if exists (select 1 from public.clients c where c.boutique_id = p_boutique_id and c.user_id = v_uid) then
    return false;
  end if;
  select private.telephone_tunisien(u.phone) into v_tel
    from auth.users u where u.id = v_uid and u.phone_confirmed_at is not null;
  if v_tel is null then
    return false;
  end if;
  select c.id into v_id from public.clients c
   where c.boutique_id = p_boutique_id and c.user_id is null and c.telephone = v_tel
   order by c.created_at
   limit 1
   for update;
  if v_id is null then
    return false;
  end if;
  update public.clients set user_id = v_uid where boutique_id = p_boutique_id and id = v_id;
  return true;
end;
$$;
comment on function public.rattacher_mon_client(uuid) is
  'À la connexion : la plus ancienne fiche sans compte au numéro vérifié (code SMS) du compte connecté lui est rattachée, s''il n''a pas encore de fiche dans la boutique. Ses commandes paraissent alors dans « Mes commandes ». Rend vrai si une fiche a été rattachée.';
revoke execute on function public.rattacher_mon_client(uuid) from public, anon;
grant  execute on function public.rattacher_mon_client(uuid) to authenticated;
