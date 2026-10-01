import { clientService } from "@/lib/console/service";
import { boutiqueDe } from "@/lib/console/equipe-serveur";
import { configSkanFact, relire, situationDe } from "@/lib/console/skanfact";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";

/* Relier une boutique à son client SkanFact (cadrage 06). Le client vient du
   formulaire, mais son nom et son matricule viennent de SkanFact, relus ici :
   un client qui n'est pas celui de l'entreprise SkanEcom n'existe pas (404).
   La base revérifie l'administrateur, refuse une boutique de démonstration
   et trace le geste ; puis la situation est lue et gardée. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = `/boutiques/${slug}/facturation`;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const boutique = await boutiqueDe(slug);
    if (!boutique) return vers("/");
    const config = configSkanFact();
    if (!config) return versAvecErreur(retour, "SkanFact n'est pas branché sur cette console.");
    const client = String(formulaire.get("client") ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(client)) {
      return versAvecErreur(retour, "Choisissez le client dans la liste.");
    }
    const s = await situationDe(config, client);
    if (!s.ok) return versAvecErreur(retour, s.statut === 404 ? "Ce client n'est pas un client de l'entreprise SkanEcom dans SkanFact." : s.raison);
    const { error } = await clientService(ip).rpc("console_lier_skanfact", {
      p_acteur: user.id,
      p_boutique_id: boutique.id,
      p_client: client,
      p_raison_sociale: s.donnees.client.raisonSociale,
      p_identifiant: s.donnees.client.identifiant,
    });
    if (error) return versAvecErreur(retour, error.hint === "demonstration" ? (error.message ?? "") : messageBase(error));
    const lue = await relire(config, boutique.id, client);
    return vers(`${retour}?${new URLSearchParams({
      ok: lue.ok
        ? `${boutique.nom} est reliée à « ${s.donnees.client.raisonSociale} » dans SkanFact.`
        : `${boutique.nom} est reliée à « ${s.donnees.client.raisonSociale} » ; sa situation n'a pas pu être lue (${lue.raison}).`,
    })}`);
  });
}
