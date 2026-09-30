import { clientSession, exigeMembre } from "@/lib/console/session";
import { Coquille, type LienCoquille } from "@/components/console/Coquille";
import { CompteurCommandes } from "@/components/console/Veille";
import { LIBELLES_ROLE } from "@/lib/gestion/libelles";
import { MODES_SUPPORT, type ModeSupport } from "@/lib/console/support";
import { BandeauSupport } from "@/components/console/AccesSupport";
import { DIRECTION } from "@/lib/gestion/tableau";
import { PEUT_MODIFIER, PEUT_STOCKER } from "@/lib/gestion/catalogue";
import type { ElementPalette } from "@/lib/gestion/palette";
import { OuvrirPalette, Palette } from "@/components/console/Palette";

/* ============================================================================
   LE BACKOFFICE D'UNE BOUTIQUE — pour son équipe (PRD §6.2), sur téléphone
   autant que sur ordinateur : le père de Skander confirme ses commandes
   entre deux clients, au comptoir.

   Ce layout vérifie le membre pour poser la coquille ; chaque page et chaque
   gestionnaire le revérifient (une navigation côté client peut ne rendre
   que la page), et la base, elle, revérifie le rôle à chaque geste.
   Pendant un accès support (C7), un bandeau le rappelle en tête de page.
   ========================================================================== */
export default async function BackofficeBoutique({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, boutique, boutiques } = await exigeMembre(slug);
  // Le service après-vente, si la boutique a le module : ses demandes à rappeler.
  const { data: sav } = await (await clientSession()).rpc("gestion_sav_etat", { p_boutique_id: boutique.boutique_id });
  const etatSav = sav as { actif: boolean; nouvelles: number } | null;
  // Les comptes professionnels, si la boutique a le module : les demandes en attente.
  const { data: pro } = await (await clientSession()).rpc("gestion_pro_etat", { p_boutique_id: boutique.boutique_id });
  const etatPro = pro as { actif: boolean; demandes: number } | null;
  const badgePro = etatPro?.actif && etatPro.demandes
    ? <span className="app-nav-compte" aria-label={`${etatPro.demandes} demande${etatPro.demandes > 1 ? "s" : ""} de compte pro`}>{etatPro.demandes}</span>
    : undefined;
  const badgeSav = etatSav?.nouvelles
    ? <span className="app-nav-compte" aria-label={`${etatSav.nouvelles} à rappeler`}>{etatSav.nouvelles}</span>
    : undefined;
  const lienCommandes = {
    href: `/gestion/${slug}`, libelle: "Commandes", icone: "commandes" as const, exact: true, aussi: [`/gestion/${slug}/commandes/`],
    extra: <CompteurCommandes slug={slug} />,
  };

  const liens: LienCoquille[] = [
    lienCommandes,
    ...(DIRECTION.includes(boutique.role)
      ? [
          { href: `/gestion/${slug}/tableau`, libelle: "Tableau de bord", icone: "graphique" as const },
          { href: `/gestion/${slug}/encaissements`, libelle: "Encaissements", icone: "billet" as const },
        ]
      : []),
    { href: `/gestion/${slug}/produits`, libelle: "Catalogue", icone: "colis" },
    { href: `/gestion/${slug}/clients`, libelle: "Clients", icone: "personne", extra: badgePro },
    ...(etatSav?.actif
      ? [{ href: `/gestion/${slug}/sav`, libelle: "SAV", icone: "outil" as const, extra: badgeSav }]
      : []),
    ...(boutique.role === "proprietaire" || boutique.role === "admin"
      ? [{ href: `/gestion/${slug}/equipe`, libelle: "Équipe", icone: "equipe" as const }]
      : []),
    { href: `/gestion/${slug}/reglages`, libelle: "Réglages", icone: "reglages" },
  ];
  // La palette (⌘K) : les pages, puis ce que la recherche trouve.
  const pages: ElementPalette[] = [
    ...liens.map((l) => ({ groupe: "Aller à", icone: l.icone, href: l.href, titre: l.libelle })),
    ...(PEUT_STOCKER.includes(boutique.role)
      ? [{ groupe: "Aller à", icone: "colis" as const, href: `/gestion/${slug}/produits/reception`, titre: "Réception d'un arrivage" }]
      : []),
    ...(PEUT_MODIFIER.includes(boutique.role)
      ? [{ groupe: "Aller à", icone: "colis" as const, href: `/gestion/${slug}/produits/nouveau`, titre: "Nouveau produit" }]
      : []),
    ...(etatPro?.actif
      ? [{ groupe: "Aller à", icone: "etoile" as const, href: `/gestion/${slug}/clients/pros`, titre: "Comptes professionnels" }]
      : []),
  ];

  return (
    <Coquille
      accueil={`/gestion/${slug}`}
      titre={boutique.nom}
      sousTitre="Backoffice"
      logo={boutique.nom.trim().charAt(0).toUpperCase()}
      changer={boutiques.length > 1 ? { href: "/gestion", libelle: "Changer de boutique" } : undefined}
      groupes={[{ titre: "Boutique", liens }]}
      onglets={[
        lienCommandes,
        { href: `/gestion/${slug}/produits`, libelle: "Catalogue", icone: "colis" },
        ...(etatSav?.actif ? [{ href: `/gestion/${slug}/sav`, libelle: "SAV", icone: "outil" as const, extra: badgeSav }] : []),
        { href: `/gestion/${slug}/clients`, libelle: "Clients", icone: "personne", extra: badgePro },
        { href: `/gestion/${slug}/reglages`, libelle: "Réglages", icone: "reglages" },
      ]}
      email={user.email ?? ""}
      role={boutique.support_jusqu_a
        ? `Support · ${MODES_SUPPORT[boutique.role as ModeSupport]?.court ?? boutique.role}`
        : (LIBELLES_ROLE[boutique.role] ?? boutique.role)}
      recherche={<OuvrirPalette />}
      rechercheCompacte={<OuvrirPalette compact />}
      palette={<Palette slug={slug} pages={pages} />}
      bandeau={boutique.support_jusqu_a ? (
        <BandeauSupport slug={slug} mode={boutique.role as ModeSupport} jusqua={boutique.support_jusqu_a} motif={boutique.support_motif} />
      ) : undefined}
    >
      {children}
    </Coquille>
  );
}
