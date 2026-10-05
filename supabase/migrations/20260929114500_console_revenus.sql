-- =====================================================================
-- LA CONSOLE, LOT E — les revenus de SkanEcom
--
-- Ce que la plateforme rapporte, sans rien inventer :
-- · le revenu mensuel attendu : le prix de la formule de chaque boutique
--   ouverte (hors démonstration). Une formule « prix à fixer » ne compte
--   pas — et la page le dit ;
-- · ce qui viendra à l'ouverture des boutiques en préparation, ce qui est
--   en pause (boutiques suspendues) ;
-- · ce que SkanFact a dit à la dernière lecture : ce qui reste à
--   encaisser, ce qui est échu, le dernier règlement. Les montants de
--   SkanFact sont des décimaux en texte : additionnés en numeric, exacts.
-- =====================================================================

create function public.console_revenus(p_acteur uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.console_exige_admin(p_acteur);
  return jsonb_build_object(
    'formules', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', f.code, 'nom', f.nom, 'prix', f.prix_mensuel_millimes,
               'actives', (select count(*) from plateforme.boutiques b where b.formule = f.code and not b.demonstration and b.statut = 'active'),
               'en_preparation', (select count(*) from plateforme.boutiques b where b.formule = f.code and not b.demonstration and b.statut = 'en_preparation'),
               'suspendues', (select count(*) from plateforme.boutiques b where b.formule = f.code and not b.demonstration and b.statut = 'suspendue'))
             order by f.position, f.nom)
        from plateforme.formules f), '[]'::jsonb),
    'boutiques', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', b.slug, 'nom', b.nom, 'statut', b.statut, 'formule', b.formule,
               'formule_nom', f.nom, 'prix', f.prix_mensuel_millimes,
               'skanfact', case when l.boutique_id is null then null else jsonb_build_object(
                 'raison_sociale', l.raison_sociale, 'contrat', l.contrat is not null, 'lue_le', s.lue_le,
                 'reste', (select so ->> 'reste' from jsonb_array_elements(s.situation -> 'soldes') so where so ->> 'devise' = 'TND' limit 1),
                 'echu', (select so ->> 'echu' from jsonb_array_elements(s.situation -> 'soldes') so where so ->> 'devise' = 'TND' limit 1),
                 'retard', s.situation -> 'retard' -> 'jours',
                 'dernier_reglement', s.situation -> 'dernierReglement') end)
             order by case b.statut when 'active' then 0 when 'en_preparation' then 1 else 2 end, f.prix_mensuel_millimes desc nulls last, b.nom)
        from plateforme.boutiques b
        left join plateforme.formules f on f.code = b.formule
        left join plateforme.facturation_liens l on l.boutique_id = b.id
        left join plateforme.facturation_situations s on s.boutique_id = b.id
       where not b.demonstration and b.statut <> 'fermee'), '[]'::jsonb),
    -- Ce que SkanFact a dit, additionné (en dinars, trois décimales).
    'skanfact', (
      select jsonb_build_object(
               'reliees', count(*),
               'lues', count(s.boutique_id),
               'reste', to_char(coalesce(sum((select (so ->> 'reste')::numeric from jsonb_array_elements(s.situation -> 'soldes') so where so ->> 'devise' = 'TND' limit 1)), 0), 'FM999999990.000'),
               'echu', to_char(coalesce(sum((select (so ->> 'echu')::numeric from jsonb_array_elements(s.situation -> 'soldes') so where so ->> 'devise' = 'TND' limit 1)), 0), 'FM999999990.000'),
               'en_retard', count(*) filter (where s.situation -> 'retard' is not null and jsonb_typeof(s.situation -> 'retard') = 'object'),
               'lue_le', min(s.lue_le))
        from plateforme.facturation_liens l
        join plateforme.boutiques b on b.id = l.boutique_id
        left join plateforme.facturation_situations s on s.boutique_id = l.boutique_id
       where b.statut <> 'fermee')
  );
end;
$$;

revoke execute on function public.console_revenus(uuid) from public, anon, authenticated;
grant  execute on function public.console_revenus(uuid) to service_role;
