import type { NextRequest } from "next/server";
import { cheminFiltres, depuisFormulaire } from "@/lib/filtres";

/* Les formulaires de filtres et de tri (qui marchent sans JavaScript)
   envoient leurs choix ici en paramètres ; on redirige vers l'adresse
   CANONIQUE de la liste, celle qui est mise en cache. */
const BASE = /^\/(catalogue|categorie\/[a-z0-9]+(-[a-z0-9]+)*)$/;

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const base = params.get("base") ?? "/catalogue";
  const cible = BASE.test(base) ? cheminFiltres(base, depuisFormulaire(params)) : "/catalogue";
  // L'adresse publique, sans le préfixe interne /_b/<boutique>, et RELATIVE :
  // le navigateur reste sur le domaine qu'il a demandé, même derrière un
  // relais ou un proxy qui réécrit l'en-tête Host. `cible` commence toujours
  // par /catalogue ou /categorie/… : jamais une autre origine.
  return new Response(null, { status: 303, headers: { Location: cible } });
}
