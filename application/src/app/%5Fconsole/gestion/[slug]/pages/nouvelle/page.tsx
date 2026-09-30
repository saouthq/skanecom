import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { EditeurPage } from "@/components/console/EditeurPage";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { adresseVitrine } from "@/lib/console/libelles";
import { cadreDeGestion, modelesDePages, PEUT_ECRIRE } from "@/lib/gestion/pages";

export const metadata: Metadata = { title: "Nouvelle page" };

/* ============================================================================
   UNE NOUVELLE PAGE — vierge, ou d'après un modèle (?modele=questions) déjà
   composé des réglages de la boutique. Rien ne paraît avant « Publiée ».
   ========================================================================== */
export default async function NouvellePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ modele?: string; erreur?: string }>;
}) {
  const [{ slug }, q] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const base = `/gestion/${slug}/pages`;
  if (!PEUT_ECRIRE.includes(boutique.role)) redirect(base);
  const sb = await clientSession();
  const [cadre, hoteConsole] = await Promise.all([cadreDeGestion(sb, boutique.boutique_id), headers().then((h) => h.get("host"))]);
  const modele = q.modele && cadre ? modelesDePages(cadre).find((m) => m.cle === q.modele) : undefined;
  const hote = cadre?.boutique.hote_principal ?? null;

  return (
    <>
      <EnTetePage
        avant={<Link href={base}><Icone nom="retour" taille={14} /> Pages</Link>}
        titre={modele ? modele.titre : "Nouvelle page"}
        description={modele
          ? "Composée de vos réglages : relisez-la, ajustez ce qui doit l'être, puis cochez « Publiée »."
          : "Un titre, une adresse, votre texte. Elle reste un brouillon tant que vous ne la publiez pas."}
      />
      <EditeurPage
        boutique={slug}
        base={base}
        action={`${base}/action`}
        vitrine={hote ? adresseVitrine(hote, hoteConsole) : null}
        affichee={hote ? hote.replace(/^www\./, "") : null}
        ecrit
        page={{
          id: null,
          version: null,
          titre: modele?.titre ?? "",
          slug: modele?.slug ?? "",
          genre: modele?.genre ?? "texte",
          corps: modele?.corps ?? "",
          publie: false,
          dans_pied: true,
        }}
        message={q.erreur ? { ok: false, texte: q.erreur } : null}
      />
    </>
  );
}
