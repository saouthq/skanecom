import type { Metadata } from "next";
import { cookies } from "next/headers";
import { exigeMembre, clientSession } from "@/lib/console/session";
import { LIBELLES_ROLE } from "@/lib/gestion/libelles";
import { COOKIE_CODES, sessionCompte } from "@/lib/console/compte";
import { PageCompte } from "@/components/console/PageCompte";

export const metadata: Metadata = { title: "Mon compte" };

/* Mon compte, pour l'équipe d'une boutique — la même page que celle de
   l'équipe SkanEcom (/compte). */
export default async function MonCompteBoutique({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string; carte?: string }>;
}) {
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const { user, boutique } = await exigeMembre(slug);
  const [moi, jar] = await Promise.all([sessionCompte(), cookies()]);
  const { data: dc } = await (await clientSession()).rpc("compte_codes_secours");
  let codesNeufs: string[] | null = null;
  try {
    const v = JSON.parse(decodeURIComponent(jar.get(COOKIE_CODES)?.value ?? "")) as { pour: string; codes: string[] };
    if (v.pour === user.id && Array.isArray(v.codes)) codesNeufs = v.codes;
  } catch { /* pas de codes tout juste créés */ }
  return (
    <PageCompte d={{
      email: user.email ?? "", role: `${LIBELLES_ROLE[boutique.role] ?? boutique.role} · ${boutique.nom}`, retour: `/gestion/${slug}/compte`,
      doubleAuth: moi?.aFacteur ?? false,
      codes: (dc ?? { restants: 0, crees_le: null }) as { restants: number; crees_le: string | null },
      codesNeufs, messages,
    }} />
  );
}
