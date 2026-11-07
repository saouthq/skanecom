"use client";

import { useEffect } from "react";

/* ============================================================================
   LES MODIFICATIONS NON ENREGISTRÉES — une page du backoffice porte souvent
   plusieurs formulaires (la fiche d'un produit : ses déclinaisons, sa fiche,
   sa fiche technique), chacun avec son « Enregistrer ». Taper la description
   puis enregistrer une déclinaison rechargeait la page : la description était
   perdue, sans un mot. De même en quittant la page par un lien.

   Désormais, un formulaire envoyé en POST où l'on a tapé quelque chose est
   « en cours » : envoyer UN AUTRE formulaire, suivre un lien ou fermer
   l'onglet demande d'abord si l'on veut perdre la saisie. Envoyer le
   formulaire lui-même, ou revenir à sa valeur de départ, lève la garde.
   Un formulaire marqué `data-sans-garde` (un réglage qui s'enregistre de
   lui-même) n'est pas suivi. Un formulaire marqué `data-confirmer="…"`
   (retirer une photo : elle ne revient pas) pose sa question avant de partir.
   ========================================================================== */

const SUIVIS = "input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]), textarea, select";

function formulaireSuivi(el: EventTarget | null): HTMLFormElement | null {
  if (!(el instanceof HTMLElement) || !el.matches(SUIVIS)) return null;
  const f = (el as HTMLInputElement).form;
  if (!f || f.method.toLowerCase() !== "post" || f.hasAttribute("data-sans-garde")) return null;
  return f;
}

/** Un champ revenu à sa valeur de départ n'est plus une modification. */
function modifie(f: HTMLFormElement): boolean {
  return [...f.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(SUIVIS)].some((c) =>
    c instanceof HTMLSelectElement ? [...c.options].some((o) => o.selected !== o.defaultSelected) : c.value !== c.defaultValue,
  );
}

const QUESTION = "Une saisie de cette page n'est pas enregistrée : la perdre ?";

export function GardeModifications() {
  useEffect(() => {
    const enCours = new Set<HTMLFormElement>();
    const relire = () => { for (const f of [...enCours]) if (!f.isConnected || !modifie(f)) enCours.delete(f); };

    const saisie = (e: Event) => {
      const f = formulaireSuivi(e.target);
      if (!f) return;
      if (modifie(f)) enCours.add(f);
      else enCours.delete(f);
    };
    const envoi = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      const question = f.getAttribute("data-confirmer");
      if (question && !window.confirm(question)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      relire();
      const autres = [...enCours].filter((x) => x !== f);
      if (autres.length && !window.confirm(QUESTION)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      enCours.clear();
    };
    const clic = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const vers = new URL(a.href, location.href);
      // Une ancre de la même page (un sommaire, « #t-photos ») ne fait rien perdre.
      if (vers.origin === location.origin && vers.pathname === location.pathname && vers.search === location.search) return;
      if (/^(tel|mailto|sms):/.test(vers.protocol)) return;
      relire();
      if (enCours.size && !window.confirm(QUESTION)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      enCours.clear();
    };
    const depart = (e: BeforeUnloadEvent) => {
      relire();
      if (!enCours.size) return;
      e.preventDefault();
      e.returnValue = "";
    };

    document.addEventListener("input", saisie, true);
    document.addEventListener("change", saisie, true);
    document.addEventListener("submit", envoi, true);
    document.addEventListener("click", clic, true);
    window.addEventListener("beforeunload", depart);
    return () => {
      document.removeEventListener("input", saisie, true);
      document.removeEventListener("change", saisie, true);
      document.removeEventListener("submit", envoi, true);
      document.removeEventListener("click", clic, true);
      window.removeEventListener("beforeunload", depart);
    };
  }, []);
  return null;
}
