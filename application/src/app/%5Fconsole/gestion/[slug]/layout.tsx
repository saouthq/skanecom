import { exigeMembre } from "@/lib/console/session";
import { Coquille } from "@/components/console/Coquille";
import { LIBELLES_ROLE } from "@/lib/gestion/libelles";

/* ============================================================================
   LE BACKOFFICE D'UNE BOUTIQUE — pour son équipe (PRD §6.2), sur téléphone
   autant que sur ordinateur : le père de Skander confirme ses commandes
   entre deux clients, au comptoir.

   Ce layout vérifie le membre pour poser la coquille ; chaque page et chaque
   gestionnaire le revérifient (une navigation côté client peut ne rendre
   que la page), et la base, elle, revérifie le rôle à chaque geste.
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

  return (
    <Coquille
      accueil={`/gestion/${slug}`}
      titre={boutique.nom}
      sousTitre="Backoffice"
      logo={boutique.nom.trim().charAt(0).toUpperCase()}
      changer={boutiques.length > 1 ? { href: "/gestion", libelle: "Changer de boutique" } : undefined}
      groupes={[
        {
          titre: "Boutique",
          liens: [{ href: `/gestion/${slug}`, libelle: "Commandes", icone: "commandes" }],
        },
      ]}
      email={user.email ?? ""}
      role={LIBELLES_ROLE[boutique.role] ?? boutique.role}
    >
      {children}
    </Coquille>
  );
}
