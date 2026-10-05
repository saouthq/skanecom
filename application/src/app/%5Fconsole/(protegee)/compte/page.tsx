import type { Metadata } from "next";
import { cookies } from "next/headers";
import { exigeAdmin, clientSession } from "@/lib/console/session";
import { LIBELLES_ROLE_PLATEFORME } from "@/lib/console/equipe-plateforme";
import { COOKIE_CODES, sessionCompte } from "@/lib/console/compte";
import { PageCompte } from "@/components/console/PageCompte";

export const metadata: Metadata = { title: "Mon compte" };

/* Mon compte, pour l'équipe SkanEcom. (La même page, pour l'équipe d'une
   boutique : /gestion/<boutique>/compte.) */
export default async function MonCompte({ searchParams }: { searchParams: Promise<{ ok?: string; erreur?: string; carte?: string }> }) {
  const { user, role } = await exigeAdmin();
  const [messages, moi, jar] = await Promise.all([searchParams, sessionCompte(), cookies()]);
  const { data: dc } = await (await clientSession()).rpc("compte_codes_secours");
  let codesNeufs: string[] | null = null;
  try {
    const v = JSON.parse(decodeURIComponent(jar.get(COOKIE_CODES)?.value ?? "")) as { pour: string; codes: string[] };
    if (v.pour === user.id && Array.isArray(v.codes)) codesNeufs = v.codes;
  } catch { /* pas de codes tout juste créés */ }
  return (
    <PageCompte d={{
      email: user.email ?? "", role: LIBELLES_ROLE_PLATEFORME[role] ?? role, retour: "/compte",
      doubleAuth: moi?.aFacteur ?? false,
      codes: (dc ?? { restants: 0, crees_le: null }) as { restants: number; crees_le: string | null },
      codesNeufs, messages,
    }} />
  );
}
