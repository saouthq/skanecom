"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/* ============================================================================
   LES RETOURS DE L'INTERFACE — ce que l'utilisateur doit voir tout de suite
   après un geste, avant que le serveur ait répondu :

   · ProgressionNavigation : un lien suivi, une barre fine court en haut de
     l'écran jusqu'à ce que la page suivante soit là ;
   · EnvoiFormulaires : un formulaire envoyé, son bouton tourne (« envoi ») et
     un second clic n'envoie rien. Les formulaires HTML ordinaires seulement
     (ceux qu'un script gère lui-même ont déjà leur état).

   Posés une fois, dans la coquille ; aucun formulaire n'a à s'en soucier.
   ========================================================================== */

export function ProgressionNavigation() {
  const chemin = usePathname();
  const recherche = useSearchParams();
  const [etat, setEtat] = useState<"repos" | "court" | "fin">("repos");
  const premier = useRef(true);

  // La page suivante est là : la barre finit sa course et s'efface.
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    setEtat("fin");
    const t = window.setTimeout(() => setEtat("repos"), 600);
    return () => window.clearTimeout(t);
  }, [chemin, recherche]);

  useEffect(() => {
    const demarre = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement).closest("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // une ancre, la même page
      setEtat("court");
    };
    const envoi = (e: SubmitEvent) => {
      if (!e.defaultPrevented) setEtat("court");
    };
    document.addEventListener("click", demarre);
    document.addEventListener("submit", envoi);
    return () => {
      document.removeEventListener("click", demarre);
      document.removeEventListener("submit", envoi);
    };
  }, []);

  return <div className="ui-progression" data-etat={etat === "repos" ? undefined : etat} aria-hidden="true" />;
}

export function EnvoiFormulaires() {
  useEffect(() => {
    const envoi = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (e.defaultPrevented) return;
      if (form.dataset.envoi) {
        e.preventDefault(); // déjà parti : un second clic n'envoie rien
        return;
      }
      form.dataset.envoi = "1";
      const bouton = (e.submitter as HTMLElement | null) ?? form.querySelector<HTMLElement>("button[type=submit], button:not([type])");
      if (bouton?.classList.contains("btn")) {
        bouton.dataset.envoi = "1";
        bouton.setAttribute("aria-busy", "true");
      }
    };
    // Retour arrière (cache du navigateur) : les formulaires redeviennent libres.
    const retour = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      document.querySelectorAll<HTMLElement>("[data-envoi]").forEach((el) => {
        delete el.dataset.envoi;
        el.removeAttribute("aria-busy");
      });
    };
    document.addEventListener("submit", envoi);
    window.addEventListener("pageshow", retour);
    return () => {
      document.removeEventListener("submit", envoi);
      window.removeEventListener("pageshow", retour);
    };
  }, []);
  return null;
}
