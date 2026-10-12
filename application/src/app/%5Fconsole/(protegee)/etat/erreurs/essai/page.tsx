import { exigeAdmin } from "@/lib/console/session";
import { redirect } from "next/navigation";

/* Une erreur d'essai (État technique → Erreurs de l'application,
   super-administrateur) : cet écran casse exprès, pour voir toute la chaîne
   tenir — l'écran d'erreur en français, l'erreur notée, puis listée sur la
   carte. Comme « Envoyer un essai » pour les alertes. */
export const dynamic = "force-dynamic";

export default async function ErreurEssai() {
  const { role } = await exigeAdmin();
  if (role !== "super_admin") redirect("/etat#t-erreurs");
  throw new Error("Erreur d'essai : provoquée depuis État technique, pour vérifier que la chaîne la note");
}
