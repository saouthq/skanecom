-- =====================================================================
-- SkanEcom · jeu de démonstration : LA STRUCTURE MONOPRODUIT (migration 72)
-- =====================================================================
-- Yasmine Beauté passe en Monoproduit : son accueil devient la page de
-- vente de son sérum éclat à la vitamine C — ses photos, sa promesse, sa
-- note, les offres par quantité (un flacon 59,000 ; deux 106,000 ; trois
-- 147,000), le formulaire de commande sur la page ; puis le geste, la
-- maison, les avis du sérum et ses questions. Le catalogue, les fiches et
-- le tunnel restent ceux de la boutique : tout le reste se vend comme
-- avant.
--
-- Le style que la structure conseille (coins arrondis, boutons en pilule,
-- titres amples), par-dessus celui de la boutique.
--
-- Cinq avis de plus sur le sérum, de cinq commandes livrées en décembre
-- 2025 (YAS-2025-00111 à 115, à la suite de celles de seed-beaute.sql : ni
-- la période du tableau de bord ni l'objectif du mois ne bougent, ni le
-- compteur des commandes de l'année), comme ceux de seed-beaute.sql : vérifiés, publiés, une
-- réponse de la boutique, aucune photo de cliente. Chaque pièce vendue
-- revient au stock (un arrivage du même jour).
--
-- Joué après seed-beaute.sql et seed-prix-quantite.sql ; rejouable sans
-- dommage.
-- =====================================================================

do $$
declare
  b constant uuid := '00000000-0000-4000-8000-000000000004';
  serum constant uuid := '00000000-0000-4000-8003-000000000401';
begin
  if not exists (select 1 from plateforme.boutiques where id = b) then
    return;
  end if;

  -- Les offres du sérum : 53,000 le flacon par deux, 49,000 par trois.
  insert into public.prix_quantite (boutique_id, produit_id, quantite, prix_millimes) values
    (b, serum, 2, 106000),
    (b, serum, 3, 147000)
  on conflict (boutique_id, produit_id, quantite) do nothing;

  -- Ses questions, une page de la boutique (au pied de page aussi).
  insert into public.pages_boutique (boutique_id, slug, genre, titre_fr, corps_fr, publie, dans_pied, position) values
    (b, 'questions-frequentes', 'questions', 'Questions fréquentes',
$t$Les réponses aux questions qu'on nous pose le plus. Une autre question ? Écrivez-nous sur WhatsApp.

### Comment payer ?
À la livraison, en espèces, au livreur. Rien n'est à payer en ligne.

### Combien coûte la livraison ?
7 TND partout en Tunisie, offerte dès 150 TND d'achat. Votre colis arrive en 1 à 2 jours ouvrés dans le Grand Tunis, en 2 à 4 jours ailleurs.

### Pourquoi deux ou trois flacons coûtent-ils moins cher ?
Ils partent dans un seul colis, livrés en une fois : nous vous faisons profiter de l'économie. Le prix par quantité s'applique de lui-même à la commande.

### Puis-je refuser le colis ?
Oui. S'il ne vous convient pas, refusez-le au livreur : vous ne payez rien.

### Convient-il aux peaux sensibles ?
Il est formulé pour toutes les peaux. Sur une peau très réactive, essayez-le d'abord sur une petite zone, à l'intérieur du poignet.

### Comment le conserver ?
À l'abri de la lumière et de la chaleur, le flacon bien fermé : la vitamine C craint la lumière, c'est pour cela que le flacon est ambré.

### Puis-je retourner un flacon ouvert ?
Pour votre sécurité, un produit ouvert ne peut être ni repris ni échangé. Un flacon fermé, oui : écrivez-nous.$t$,
     true, true, 1)
  on conflict do nothing;

  update public.themes t
     set code = 'monoproduit',
         style = '{"coins": "arrondis", "boutons": "pilule", "titres": "ample"}'::jsonb || coalesce(t.style, '{}'::jsonb),
         sections = $s$[
  {"type": "piece", "produit": "serum-eclat-vitamine-c",
   "textes": {"etiquette_fr": "Le sérum de Yasmine",
              "titre_fr": "Le teint lumineux, en quelques gouttes.",
              "texte_fr": "Vitamine C stabilisée et acide hyaluronique, dans un flacon ambré qui la protège de la lumière.\n- Quelques gouttes le matin, avant la crème\n- Pour toutes les peaux\n- Un flacon de 30 ml, fait en Tunisie"}},
  {"type": "editorial",
   "textes": {"etiquette_fr": "Le geste",
              "titre_fr": "Quelques gouttes,\nle matin.",
              "texte_fr": "Sur la peau propre, du bout des doigts, du centre du visage vers l'extérieur. Une minute pour qu'il pénètre, puis votre crème habituelle.",
              "image_alt_fr": "Femme qui dépose une goutte de sérum avec une pipette"},
   "image": {"chemin": "yasmine-beaute/accueil/hero-portrait-1200.webp"}},
  {"type": "editorial", "lien": "/catalogue",
   "textes": {"etiquette_fr": "La maison",
              "titre_fr": "Peu de produits,\ndes formules simples.",
              "texte_fr": "Yasmine fait ses soins à Tunis : des huiles pressées à froid, des savons à l'huile d'olive, des parfums de fleurs. Chacun sert à quelque chose.",
              "cta_fr": "Voir tous nos soins",
              "image_alt_fr": "Femme en peignoir devant un miroir, des plantes sur la table"},
   "image": {"chemin": "yasmine-beaute/accueil/rituel-1200.webp"}},
  {"type": "avis", "nombre": 6, "textes": {"titre_fr": "Ce qu'en disent nos clientes"}},
  {"type": "questions", "nombre": 5, "page": "questions-frequentes", "textes": {"titre_fr": "Vos questions"}},
  {"type": "engagements"}
]$s$::jsonb
   where t.boutique_id = b
     and t.code <> 'monoproduit';
end
$$;

-- ---------------------------------------------------------------------
-- Cinq avis de plus sur le sérum (le seed de la boutique en a un).
-- ---------------------------------------------------------------------
do $$
declare
  b constant uuid := '00000000-0000-4000-8000-000000000004';
  a          record;
  t0         timestamptz;
  v_variante public.variantes;
  v_client   uuid;
  v_commande uuid;
  v_devis    jsonb;
  v_ligne    public.commande_lignes;
  v_stock    integer;
begin
  if not exists (select 1 from plateforme.boutiques where id = b)
     or exists (select 1 from public.commandes where boutique_id = b and numero = 'YAS-2025-00111') then
    return;
  end if;
  for a in
    select * from (values
      (1, 'Leila Mansour',   '+21620444411', 'Tunis',  'tunis',  date '2025-12-09', 1, 5,
          'Mon teint est plus égal depuis que je l''utilise le matin. La texture est légère, elle pénètre tout de suite.', null),
      (2, 'Amira Ben Salah', '+21620444412', 'Sfax',   'sfax',   date '2025-12-13', 3, 5,
          'J''en ai pris trois, un pour moi et deux pour mes sœurs : à trois, le flacon revient bien moins cher. Livrée en trois jours.', null),
      (3, 'Yosra Khelifi',   '+21620444413', 'Sousse', 'sousse', date '2025-12-17', 1, 4,
          'Bon sérum, l''odeur est discrète. Quatre étoiles : la pipette attrape mal les dernières gouttes.',
          'Merci Yosra ! En penchant un peu le flacon, la pipette atteint le fond.'),
      (4, 'Ines Ferchichi',  '+21620444414', 'Ariana', 'ariana', date '2025-12-20', 2, 5,
          'Je le mets sous ma crème solaire, il ne bouloche pas. Ma peau mixte le supporte très bien.', null),
      (5, 'Rania Bouzid',    '+21620444415', 'Nabeul', 'nabeul', date '2025-12-27', 1, 4,
          'Ma peau est plus lumineuse au bout de quelques semaines ; il faut être patiente, ce n''est pas magique.', null)
    ) as t(n, nom, tel, ville, gouv, le, quantite, note, texte, reponse)
    order by n
  loop
    t0 := a.le + time '19:40';
    select * into v_variante from public.variantes where boutique_id = b and sku = 'YAS-SER-30';
    insert into public.clients (boutique_id, nom, telephone, created_at) values (b, a.nom, a.tel, t0) returning id into v_client;
    v_devis := private.chiffre_commande(b, jsonb_build_array(jsonb_build_object('variante_id', v_variante.id, 'quantite', a.quantite)), a.gouv, false);
    insert into public.commandes (boutique_id, numero, origine, client_id, contact_nom, contact_telephone,
                                  livraison_ligne1, livraison_ville, livraison_gouvernorat, livraison_zone_nom,
                                  sous_total_millimes, frais_livraison_millimes, total_millimes, created_at)
    values (b, 'YAS-2025-' || lpad((110 + a.n)::text, 5, '0'), 'vitrine', v_client, a.nom, a.tel, 'Adresse de démonstration',
            a.ville, a.gouv, v_devis -> 'zone' ->> 'nom_fr',
            (v_devis ->> 'sous_total_millimes')::bigint, (v_devis ->> 'frais_livraison_millimes')::bigint,
            (v_devis ->> 'total_millimes')::bigint, t0)
    returning id into v_commande;
    insert into public.commande_lignes (boutique_id, commande_id, variante_id, produit_nom, variante_libelle, sku,
                                        prix_unitaire_millimes, quantite, total_ligne_millimes, created_at)
    select b, v_commande, (l ->> 'variante_id')::uuid, l ->> 'produit_nom', l ->> 'variante_libelle', l ->> 'sku',
           (l ->> 'prix_unitaire_millimes')::bigint, (l ->> 'quantite')::integer, (l ->> 'total_ligne_millimes')::bigint, t0
    from jsonb_array_elements(v_devis -> 'lignes') l
    returning * into v_ligne;

    -- Vendues sur un arrivage d'alors : les pièces reviennent au stock du jour.
    perform set_config('skanecom.ecriture_stock', 'on', true);
    update public.variantes set stock = stock + a.quantite where boutique_id = b and id = v_variante.id returning stock into v_stock;
    perform set_config('skanecom.ecriture_stock', '', true);
    insert into public.stock_mouvements (boutique_id, variante_id, delta, stock_apres, motif, commentaire, created_at)
    values (b, v_variante.id, a.quantite, v_stock, 'reception', 'Arrivage de 2025 (jeu de démo)', t0);

    insert into public.confirmations (boutique_id, commande_id, canal, resultat, created_at)
    values (b, v_commande, 'appel', 'confirmee', t0 + interval '14 hours');
    update public.commandes set statut = 'confirmee' where id = v_commande;
    update public.commandes set statut = 'expediee', transporteur = 'Aramex', numero_suivi = 'TN' || (47200000 + a.n * 191) where id = v_commande;
    update public.commandes set statut = 'livree', statut_paiement = 'paye' where id = v_commande;
    update public.commande_evenements e
       set created_at = t0 + case e.statut_apres when 'recue' then interval '0' when 'confirmee' then interval '14 hours'
                                                 when 'expediee' then interval '30 hours' else interval '50 hours' end
     where e.commande_id = v_commande;
    update public.commandes
       set confirmee_at = t0 + interval '14 hours', expediee_at = t0 + interval '30 hours',
           livree_at = t0 + interval '50 hours', cloturee_at = t0 + interval '50 hours'
     where id = v_commande;

    insert into public.avis (boutique_id, produit_id, commande_id, ligne_id, client_id, note, texte, auteur, variante_libelle,
                             statut, modere_le, reponse, repondu_le, created_at)
    values (b, v_variante.produit_id, v_commande, v_ligne.id, v_client, a.note, a.texte,
            private.nom_public(a.nom), v_ligne.variante_libelle, 'publie', t0 + interval '5 days',
            a.reponse, case when a.reponse is not null then t0 + interval '5 days' end, t0 + interval '4 days');
  end loop;
end
$$;
