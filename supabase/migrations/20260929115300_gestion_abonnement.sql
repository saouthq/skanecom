-- =====================================================================
-- L'ABONNEMENT, LU PAR LE COMMERÇANT (demande de Skander, 06/10 : « l'écran
-- où tu renseignes les informations de la carte et la facturation ») :
--
--   · sa formule (ou « sur mesure »), son prix s'il est fixé, ce qu'elle
--     ouvre et ce qui vient avec une formule supérieure ;
--   · ses factures SkanEcom à payer : la dernière lecture que la console a
--     gardée de SkanFact (migration …_facturation_skanfact), telle quelle,
--     avec son heure — sans le lien vers l'écran de SkanFact (l'entreprise
--     SkanEcom y est seule) ;
--   · ses envois du mois (e-mails, SMS) face à ce qui est compris ;
--   · où écrire à SkanEcom (l'adresse de réponse réglée dans la console).
-- Lecture seule : rien ne se paie ni ne se saisit ici (aucune carte n'est
-- jamais saisie sur SkanEcom) ; la formule se change auprès de SkanEcom.
-- La direction de la boutique (propriétaire, administrateur, lecture).
-- =====================================================================

create function public.gestion_abonnement(p_boutique_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b      plateforme.boutiques;
  v_mois date := private.mois_tunis(now());
begin
  perform private.catalogue_exige(p_boutique_id, array['proprietaire', 'admin', 'lecture']);
  select * into b from plateforme.boutiques x where x.id = p_boutique_id;
  return jsonb_build_object(
    'formule', (select jsonb_build_object('code', f.code, 'nom', f.nom, 'description', f.description)
                  from plateforme.formules f where f.code = b.formule),
    'prix', coalesce(b.prix_mensuel_millimes, (select f.prix_mensuel_millimes from plateforme.formules f where f.code = b.formule)),
    'personnalisee', exists (select 1 from plateforme.droits_boutique x where x.boutique_id = b.id),
    'demonstration', b.demonstration,
    -- Où écrire à SkanEcom : l'adresse de réponse de ses e-mails, réglée dans la console (vide : rien).
    'contact', (select nullif(btrim(r.valeur #>> '{}'), '') from plateforme.reglages_plateforme r where r.cle = 'courriels.reponse_a'),
    'droits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', d.code, 'groupe', d.groupe, 'libelle', d.libelle_fr, 'description', d.description_fr,
               'ouvert', private.droit(b.id, d.code),
               'requise', case when private.droit(b.id, d.code) then null else private.formule_requise(d.code) ->> 'nom' end)
             order by d.groupe, d.position, d.code)
        from plateforme.droits d
       where d.module is null or (select m.disponible from plateforme.modules m where m.code = d.module)), '[]'::jsonb),
    'facturation', (
      select jsonb_build_object(
               'raison_sociale', l.raison_sociale,
               'lue_le', s.lue_le,
               'soldes', coalesce(s.situation -> 'soldes', '[]'::jsonb),
               'retard', case when s.situation -> 'retard' is null or jsonb_typeof(s.situation -> 'retard') = 'null' then null
                              else (s.situation -> 'retard') - 'ecran' end,
               'dernier_reglement', case when jsonb_typeof(s.situation -> 'dernierReglement') = 'object' then s.situation -> 'dernierReglement' end,
               'factures', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'numero', x ->> 'numero', 'date', x ->> 'datePiece', 'echeance', x ->> 'echeance',
                          'devise', x ->> 'devise', 'symbole', x ->> 'symbole', 'net', x ->> 'netAPayer',
                          'reste', x ->> 'reste', 'objet', x ->> 'objet')
                        order by x ->> 'echeance' nulls last, x ->> 'datePiece')
                   from jsonb_array_elements(s.factures) x), '[]'::jsonb))
        from plateforme.facturation_liens l
        left join plateforme.facturation_situations s on s.boutique_id = l.boutique_id
       where l.boutique_id = b.id),
    'envois', jsonb_build_object(
      'mois', v_mois,
      'email', jsonb_build_object(
        'envoyes', coalesce((select sum(c.envoyes) from plateforme.consommations c
                              where c.boutique_id = b.id and c.canal = 'email' and c.mois = v_mois), 0),
        'quota', private.quota_envois(b.id, 'email', v_mois)),
      'sms', jsonb_build_object(
        'envoyes', coalesce((select sum(c.envoyes) from plateforme.consommations c
                              where c.boutique_id = b.id and c.canal = 'sms' and c.mois = v_mois), 0),
        'quota', private.quota_envois(b.id, 'sms', v_mois)))
  );
end;
$$;

revoke execute on function public.gestion_abonnement(uuid) from public, anon;
grant  execute on function public.gestion_abonnement(uuid) to authenticated;
