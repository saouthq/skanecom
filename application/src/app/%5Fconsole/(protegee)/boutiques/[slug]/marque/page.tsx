import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { clientService } from "@/lib/console/service";
import { exigeAdmin } from "@/lib/console/session";
import { EditeurMarque, type ThemeEdite } from "./EditeurMarque";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return { title: `Marque · ${(await params).slug}` };
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
      <p className="text-petit">
        <Link href="/" className="text-encre-doux hover:underline">Boutiques</Link>
        <span className="text-encre-doux"> / </span>
        <Link href={`/boutiques/${slug}`} className="text-encre-doux hover:underline">{boutique.nom}</Link>
      </p>
      <h1 className="mt-1">Marque</h1>
      <p className="text-encre-doux mt-1">
        Tout ce qui habille la vitrine. La base refuse toute valeur hors liste ; chaque enregistrement est tracé.
        Visible sur la boutique d&apos;ici cinq minutes (le temps que ses pages en cache se renouvellent).
      </p>
      <div className="mt-6 grid gap-5">
        {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
        {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}
        <EditeurMarque slug={slug} boutiqueId={boutique.id} nom={boutique.nom} theme={theme} />
      </div>
    </>
  );
}
