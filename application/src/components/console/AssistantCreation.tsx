"use client";

import { useEffect, useRef } from "react";

/* ============================================================================
   L'ASSISTANT DE CRÉATION D'UNE BOUTIQUE — le formulaire de « Nouvelle
   boutique » en cinq étapes (.nb-etape : le client, le domaine, le métier,
   l'apparence, l'offre), une à la fois, avec leur rangée en tête
   (.nb-tete [data-aller]) et un récapitulatif avant de créer
   ([data-recap]). Sans JavaScript, le formulaire reste entier, d'un bloc.

   · « Continuer » vérifie les champs de l'étape avant de passer à la
     suivante ; Entrée dans un champ fait de même (le formulaire ne part
     qu'à la dernière étape).
   · Choisir un métier dit la structure qu'il pose ([data-structure-metier]).
   · Le domaine : seuls les champs du cas choisi comptent ([data-pour],
     les autres désactivés) ; l'adresse provisoire suit l'identifiant ; un
     achat se vérifie d'abord (libre ? à quel prix ?), puis se confirme en
     toutes lettres, avec ce prix.
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

    // ---- Le domaine ----
    const modeDomaine = () => form.querySelector<HTMLInputElement>('input[name="domaine_mode"]:checked')?.value ?? "sien";
    const achat = form.querySelector<HTMLInputElement>('input[name="achat"]');
    const achatEtat = form.querySelector<HTMLElement>("[data-achat-etat]");
    const achatConfirme = form.querySelector<HTMLElement>("[data-achat-confirme]");
    const achatPrix = form.querySelector<HTMLInputElement>("[data-achat-prix]");
    let achatVerifie = "";
    const appliqueDomaine = () => {
      const m = modeDomaine();
      form.querySelectorAll<HTMLElement>("[data-pour]").forEach((bloc) => {
        const actif = bloc.dataset.pour === m;
        bloc.hidden = !actif;
        bloc.querySelectorAll<HTMLInputElement>("input").forEach((c) => { c.disabled = !actif; });
      });
      // La case de confirmation ne compte qu'une fois le prix connu.
      if (achatConfirme) {
        achatConfirme.hidden = m !== "acheter" || !achatVerifie;
        achatConfirme.querySelectorAll("input").forEach((c) => { c.disabled = achatConfirme.hidden; });
      }
      if (achat) achat.setCustomValidity(m === "acheter" && achat.value.trim() && achatVerifie !== achat.value.trim().toLowerCase() ? "Vérifiez d'abord ce domaine (libre ? à quel prix ?)." : "");
    };
    const disAdresse = () => {
      const cible = form.querySelector<HTMLElement>("[data-adresse-provisoire]");
      if (cible) cible.textContent = `${valeur("slug") || "l'identifiant"}.${cible.dataset.racine ?? ""}`;
    };
    const verifierAchat = async () => {
      if (!achat || !achatEtat) return;
      const nom = achat.value.trim().toLowerCase();
      achatVerifie = "";
      if (achatPrix) achatPrix.value = "";
      achat.setCustomValidity("");
      if (!nom || achat.validity.patternMismatch) { achat.reportValidity(); appliqueDomaine(); return; }
      achatEtat.textContent = "Vérification au registre…";
      try {
        const r = await fetch(`/nouvelle-boutique/domaine?${new URLSearchParams({ nom })}`, { headers: { accept: "application/json" } });
        const j = (await r.json()) as { ok: boolean; raison?: string; valeur?: { nom: string; achetable: boolean; prix: string | null; devise: string | null; raison: string | null }[] };
        const d = j.valeur?.[0];
        if (!j.ok || !d) achatEtat.textContent = `La vérification n'a pas abouti : ${j.raison ?? "réessayez"}.`;
        else if (!d.achetable) achatEtat.textContent = `${d.nom} : ${d.raison ?? "pas à vendre"}.`;
        else {
          const prix = `${Number(d.prix).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} ${d.devise === "USD" ? "$" : d.devise ?? ""}`;
          achatEtat.textContent = `${d.nom} est libre : ${prix} la première année.`;
          achatVerifie = nom;
          if (achatPrix) { achatPrix.value = `${d.prix} ${d.devise ?? ""}`.trim(); achatPrix.dataset.lisible = prix; }
          const phrase = form.querySelector<HTMLElement>("[data-achat-phrase]");
          if (phrase) phrase.textContent = `J'achète ${d.nom} pour ${prix} par an.`;
        }
      } catch {
        achatEtat.textContent = "La vérification n'a pas abouti (réseau) : réessayez.";
      }
      appliqueDomaine();
      if (achatVerifie) achatConfirme?.querySelector<HTMLInputElement>("input")?.focus();
    };
    const domaineLu = () => {
      const m = modeDomaine();
      if (m === "provisoire") return `${form.querySelector("[data-adresse-provisoire]")?.textContent ?? ""} (adresse provisoire)`;
      if (m === "acheter") return achatVerifie ? `${achatVerifie}, acheté à la création (${achatPrix?.dataset.lisible ?? achatPrix?.value ?? ""} par an)` : "à acheter";
      return valeur("hote");
    };

    const structure = () => {
      const m = metierChoisi();
      if (m?.value) return `${m.dataset.gabaritLibelle ?? m.dataset.gabarit ?? ""}, posée par le métier`;
      return choixLu("theme");
    };

    const recap = () => {
      const lignes: [string, string][] = [
        ["Boutique", valeur("nom")],
        ["Identifiant", valeur("slug")],
        ["Domaine", domaineLu()],
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
      appliqueDomaine();
      if (focus) {
        const titre = etapes[i].querySelector<HTMLElement>(".nb-etape-titre");
        titre?.focus();
        form.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    };

    // Les champs de l'étape, vérifiés comme le navigateur le ferait à l'envoi.
    // (L'assistant vérifie lui-même, étape par étape : le navigateur, lui,
    // bloquerait sur un champ requis d'une étape pas encore montrée.)
    const valide = (i: number, dire = true) => {
      for (const c of etapes[i].querySelectorAll<HTMLInputElement>("input, select, textarea")) {
        if (!c.checkValidity()) { if (dire) c.reportValidity(); return false; }
      }
      return true;
    };

    const clic = (e: MouseEvent) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-suivant], [data-precedent], [data-aller], [data-verifier-achat]");
      if (!b || !form.contains(b)) return;
      e.preventDefault();
      if (b.hasAttribute("data-verifier-achat")) { void verifierAchat(); return; }
      if (b.hasAttribute("data-suivant")) { if (valide(courante)) montre(courante + 1); return; }
      if (b.hasAttribute("data-precedent")) { montre(Math.max(0, courante - 1)); return; }
      const cible = Number(b.dataset.aller);
      // En arrière, toujours ; en avant, seulement si les étapes d'avant sont bonnes.
      for (let k = courante; k < cible; k++) if (!valide(k)) { montre(k); valide(k); return; }
      montre(cible);
    };
    const envoi = (e: SubmitEvent) => {
      // Entrée dans le domaine à acheter : le vérifier, pas passer.
      if (achat && document.activeElement === achat && achatVerifie !== achat.value.trim().toLowerCase()) {
        e.preventDefault();
        e.stopImmediatePropagation();
        void verifierAchat();
        return;
      }
      if (courante >= etapes.length - 1) {
        // Créer : toutes les étapes d'abord ; la première incomplète revient à l'écran.
        const k = etapes.findIndex((_, i) => !valide(i, false));
        if (k === -1) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        montre(k);
        valide(k);
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      if (valide(courante)) montre(courante + 1);
    };
    const change = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.name === "metier") disStructure();
      if (t.name === "domaine_mode") appliqueDomaine();
      if (courante === etapes.length - 1) recap();
    };
    // Taper : l'adresse provisoire suit l'identifiant ; un domaine changé se revérifie.
    const saisie = (e: Event) => {
      const t = e.target as HTMLInputElement;
      // (l'identifiant suit le nom, tiré juste après : lu au tour suivant)
      if (t.name === "slug" || t.name === "nom") setTimeout(disAdresse, 0);
      if (t === achat && achatVerifie && achatVerifie !== achat.value.trim().toLowerCase()) {
        achatVerifie = "";
        if (achatEtat) achatEtat.textContent = "Domaine changé : vérifiez-le de nouveau.";
        appliqueDomaine();
      } else if (t === achat) appliqueDomaine();
    };

    form.dataset.assistant = "";
    form.noValidate = true;
    montre(courante, false);
    form.addEventListener("click", clic);
    form.addEventListener("submit", envoi, { capture: true });
    form.addEventListener("change", change);
    form.addEventListener("input", saisie);
    disAdresse();
    return () => {
      form.removeEventListener("input", saisie);
      form.removeEventListener("click", clic);
      form.removeEventListener("submit", envoi, { capture: true });
      form.removeEventListener("change", change);
      delete form.dataset.assistant;
      form.noValidate = false;
      etapes.forEach((e) => { e.hidden = false; });
    };
  }, [etapeInitiale]);
  return <span ref={ancre} hidden />;
}
