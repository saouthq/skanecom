"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { attributsDuStyle, feuilleDuTheme, themeDeLaBoutique, type CodeTheme, type Structure } from "@/lib/theme";

/* ============================================================================
   L'APERÇU EN DIRECT — dans le cadre de l'écran « Apparence » du backoffice,
   la vitrine prend à chaque geste l'apparence essayée : couleurs, polices,
   style. Rien n'est enregistré ici ; hors d'un cadre, ce composant ne fait
   rien.

   Le dialogue :
   · la vitrine dit au cadre parent qu'elle est prête, et sur quelle page
     (« skanecom:apercu-pret ») — à chaque page, pour que l'éditeur sache où
     l'on est et renvoie l'apparence ;
   · l'éditeur envoie l'apparence (« skanecom:apparence »). Seule la console
     peut parler (l'origine est vérifiée), et chaque valeur repasse par
     themeDeLaBoutique : couleurs #RRGGBB, polices et style des listes
     fermées. La feuille produite ne contient donc rien de libre.

   Le gabarit, lui, change les composants : il ne s'essaie pas ici, l'éditeur
   recharge le cadre sur l'aperçu du brouillon (src/proxy.ts).
   ========================================================================== */

export const MESSAGE_PRET = "skanecom:apercu-pret";
export const MESSAGE_APPARENCE = "skanecom:apparence";

const HOTE_CONSOLE = (process.env.NEXT_PUBLIC_CONSOLE_HOTE ?? "").toLowerCase();

function deLaConsole(origine: string): boolean {
  try {
    return HOTE_CONSOLE !== "" && new URL(origine).hostname === HOTE_CONSOLE.replace(/:\d+$/, "");
  } catch {
    return false;
  }
}

export function ApercuApparence({ code, structure }: { code: CodeTheme; structure: Structure }) {
  const chemin = usePathname();

  useEffect(() => {
    if (window.self === window.top) return;
    document.documentElement.setAttribute("data-dans-cadre", "");

    const applique = (contenu: Record<string, unknown>) => {
      const theme = themeDeLaBoutique({ code, couleurs: contenu.couleurs, polices: contenu.polices, style: contenu.style });
      let feuille = document.getElementById("apercu-apparence");
      if (!feuille) {
        feuille = document.createElement("style");
        feuille.id = "apercu-apparence";
        document.head.appendChild(feuille);
      }
      feuille.textContent = feuilleDuTheme(theme, () => "");
      for (const [nom, valeur] of Object.entries(attributsDuStyle(theme.style))) document.documentElement.setAttribute(nom, valeur);
    };

    const ecoute = (e: MessageEvent) => {
      if (e.source !== window.parent || !deLaConsole(e.origin)) return;
      const message = e.data as { type?: unknown; contenu?: unknown } | null;
      if (message?.type !== MESSAGE_APPARENCE || !message.contenu || typeof message.contenu !== "object") return;
      applique(message.contenu as Record<string, unknown>);
    };
    window.addEventListener("message", ecoute);
    return () => window.removeEventListener("message", ecoute);
  }, [code]);

  // À chaque page : « prête », et où — le chemin de la page, sans le jeton
  // de l'aperçu (rien de privé ne part, même vers le cadre parent).
  useEffect(() => {
    if (window.self === window.top) return;
    const recherche = new URLSearchParams(location.search);
    recherche.delete("apercu");
    const reste = recherche.toString();
    window.parent.postMessage({ type: MESSAGE_PRET, chemin: location.pathname + (reste ? `?${reste}` : ""), gabarit: structure }, "*");
  }, [chemin, structure]);

  return null;
}
