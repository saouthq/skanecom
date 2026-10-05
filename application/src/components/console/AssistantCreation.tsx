"use client";

import { useEffect, useRef } from "react";

/* ============================================================================
   L'ASSISTANT DE CRÉATION D'UNE BOUTIQUE — le formulaire de « Nouvelle
   boutique » en quatre étapes (.nb-etape : le client, le métier,
   l'apparence, l'offre), une à la fois, avec leur rangée en tête
   (.nb-tete [data-aller]) et un récapitulatif avant de créer
   ([data-recap]). Sans JavaScript, le formulaire reste entier, d'un bloc.

   · « Continuer » vérifie les champs de l'étape avant de passer à la
     suivante ; Entrée dans un champ fait de même (le formulaire ne part
     qu'à la dernière étape).
   · Choisir un métier dit la structure qu'il pose ([data-structure-metier]).
   ========================================================================== */

export function AssistantCreation({ etapeInitiale = 0 }: { etapeInitiale?: number }) {
  const ancre = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ancre.current?.closest("form");
    if (!form) return;
    const etapes = [...form.querySelectorAll<HTMLElement>(".nb-etape")];
    const pastilles = [...form.querySelectorAll<HTMLButtonElement>(".nb-tete [data-aller]")];
    if (etapes.length < 2) return;
    let courante = Math.min(Math.max(0, etapeInitiale), etapes.length - 1);

    const valeur = (nom: string) => (form.elements.namedItem(nom) as HTMLInputElement | null)?.value?.trim() ?? "";
    const choixLu = (nom: string) => {
      const c = form.querySelector<HTMLInputElement>(`input[name="${nom}"]:checked`);
      return c ? (c.closest("label")?.querySelector("b")?.textContent ?? c.value).trim() : "";
    };
    const metierChoisi = () => form.querySelector<HTMLInputElement>('input[name="metier"]:checked');

    const structure = () => {
      const m = metierChoisi();
      if (m?.value) return `${m.dataset.gabaritLibelle ?? m.dataset.gabarit ?? ""}, posée par le métier`;
      return choixLu("theme");
    };

    const recap = () => {
      const lignes: [string, string][] = [
        ["Boutique", valeur("nom")],
        ["Identifiant", valeur("slug")],
        ["Domaine", valeur("hote")],
        ["À appeler", [valeur("contact_nom"), valeur("contact_telephone")].filter(Boolean).join(" · ") || "à noter plus tard"],
        ["Métier", form.querySelector('input[name="modele"]') ? "à partir d'une autre boutique" : choixLu("metier") || "aucun"],
        ["Structure", form.querySelector('input[name="modele"]') ? "celle du modèle" : structure()],
        ["Formule", choixLu("formule") || "sur mesure"],
        ["Modules", [...form.querySelectorAll<HTMLInputElement>('input[name="module"]:checked')]
          .map((c) => c.closest("label")?.querySelector("b")?.textContent?.trim() ?? c.value).join(", ") || "aucun pour l'instant"],
        ["Démonstration", (form.elements.namedItem("demonstration") as HTMLInputElement | null)?.checked ? "oui" : "non, une cliente"],
      ];
      const dl = form.querySelector<HTMLElement>("[data-recap]");
      if (!dl) return;
      dl.replaceChildren(...lignes.map(([t, v]) => {
        const div = document.createElement("div");
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = t;
        dd.textContent = v;
        div.append(dt, dd);
        return div;
      }));
    };

    const disStructure = () => {
      const m = metierChoisi();
      const cible = form.querySelector<HTMLElement>("[data-structure-metier]");
      if (cible) cible.textContent = m?.value ? `Le métier « ${choixLu("metier")} » pose la structure ${m.dataset.gabaritLibelle ?? ""} ; elle se change ensuite dans Marque.` : "";
    };

    const montre = (i: number, focus = true) => {
      courante = i;
      etapes.forEach((e, k) => { e.hidden = k !== i; });
      pastilles.forEach((p, k) => {
        p.setAttribute("aria-current", k === i ? "step" : "false");
        if (k < i) p.dataset.faite = ""; else delete p.dataset.faite;
      });
      if (i === etapes.length - 1) recap();
      disStructure();
      if (focus) {
        const titre = etapes[i].querySelector<HTMLElement>(".nb-etape-titre");
        titre?.focus();
        form.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    };

    // Les champs de l'étape, vérifiés comme le navigateur le ferait à l'envoi.
    const valide = (i: number) => {
      for (const c of etapes[i].querySelectorAll<HTMLInputElement>("input, select, textarea")) {
        if (!c.checkValidity()) { c.reportValidity(); return false; }
      }
      return true;
    };

    const clic = (e: MouseEvent) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-suivant], [data-precedent], [data-aller]");
      if (!b || !form.contains(b)) return;
      e.preventDefault();
      if (b.hasAttribute("data-suivant")) { if (valide(courante)) montre(courante + 1); return; }
      if (b.hasAttribute("data-precedent")) { montre(Math.max(0, courante - 1)); return; }
      const cible = Number(b.dataset.aller);
      // En arrière, toujours ; en avant, seulement si les étapes d'avant sont bonnes.
      for (let k = courante; k < cible; k++) if (!valide(k)) { montre(k); valide(k); return; }
      montre(cible);
    };
    const envoi = (e: SubmitEvent) => {
      if (courante >= etapes.length - 1) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (valide(courante)) montre(courante + 1);
    };
    const change = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.name === "metier") disStructure();
      if (courante === etapes.length - 1) recap();
    };

    form.dataset.assistant = "";
    montre(courante, false);
    form.addEventListener("click", clic);
    form.addEventListener("submit", envoi, { capture: true });
    form.addEventListener("change", change);
    return () => {
      form.removeEventListener("click", clic);
      form.removeEventListener("submit", envoi, { capture: true });
      form.removeEventListener("change", change);
      delete form.dataset.assistant;
      etapes.forEach((e) => { e.hidden = false; });
    };
  }, [etapeInitiale]);
  return <span ref={ancre} hidden />;
}
