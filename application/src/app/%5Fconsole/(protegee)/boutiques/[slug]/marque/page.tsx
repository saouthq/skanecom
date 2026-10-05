import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { imagesDuTheme } from "@/lib/console/images-marque";
import { EditeurMarque, type ThemeEdite } from "./EditeurMarque";
import { titreBoutique } from "@/lib/console/titre-boutique";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: await titreBoutique(params, "Marque") };
}

/* C2 · Réglages de marque, avec aperçu. */
export default async function Marque({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ erreur?: string; ok?: string }>;
}) {
  await exigeAdmin();
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const { data, error } = await clientService().rpc("console_boutique", { p_slug: slug });
  if (error) throw new Error(`Boutique illisible : ${error.message}`);
  if (!data?.theme) notFound();
  const { boutique, theme } = data as { boutique: { id: string; nom: string; slug: string }; theme: ThemeEdite };

  return (
    <>
      <div className="sous-tete">
        <h2>Marque</h2>
        <p>
          Tout ce qui habille la vitrine. La base refuse toute valeur hors liste ; chaque enregistrement est tracé.
          Visible sur la boutique d&apos;ici cinq minutes (le temps que ses pages en cache se renouvellent).
        </p>
      </div>
      <div className="grid gap-5">
        {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
        {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}
        <EditeurMarque slug={slug} boutiqueId={boutique.id} nom={boutique.nom} theme={theme} images={imagesDuTheme(theme)} />
      </div>
    </>
  );
}
