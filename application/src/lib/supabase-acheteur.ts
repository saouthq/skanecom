import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/* ============================================================================
   LE CLIENT DE LA BASE AVEC LA SESSION DE L'ACHETEUR — pour les routes du
   tunnel (devis, commande) : la session de la connexion par code SMS est
   lue dans ses cookies, si bien que la base sait qui demande. Le devis et la
   commande voient ainsi la même personne (un pro validé : le même prix pro
   des deux côtés, sans quoi la commande serait refusée pour « total
   changé »). Sans session : anonyme, comme avant.
   ========================================================================== */

export async function clientAcheteur() {
  const magasin = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => magasin.getAll(),
      // Une session expirée est rafraîchie au passage : les nouveaux jetons
      // repartent dans la réponse.
      setAll: (liste) => {
        for (const { name, value, options } of liste) magasin.set(name, value, options);
      },
    },
    global: { headers: { "x-application-name": "skanecom-vitrine" } },
  });
}
