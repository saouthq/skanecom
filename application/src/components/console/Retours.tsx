"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/* ============================================================================
   LES RETOURS DE L'INTERFACE — ce que l'utilisateur doit voir tout de suite
   après un geste, avant que le serveur ait répondu :

   · ProgressionNavigation : un lien suivi, une barre fine court en haut de
     l'écran jusqu'à ce que la page suivante soit là ;
   · EnvoiFormulaires : un formulaire envoyé, son bouton tourne (« envoi ») et
     un second clic n'envoie rien. Les formulaires HTML ordinaires seulement
     (ceux qu'un script gère lui-même ont déjà leur état).

   ET LE GESTE EN PLACE — au backoffice et dans la console, un formulaire ne
   recharge plus la page : il part par fetch, la redirection 303 du serveur
   dit où revenir (?ok=, ?fait=, ?erreur=). Sur la même page, l'adresse
   change et le serveur rend la page ENTIÈRE, mise en page et compteurs de
   la navigation compris, sans rien servir des caches du routeur : ce qu'on
   voit après un geste est ce que la base contient. Pas de rechargement, pas
   de saut de défilement ; dans une transition de vue, ce qui a changé passe
   en fondu, une ligne qui quitte une liste s'efface pendant que les autres
   se resserrent, une ligne qui change de place glisse jusqu'à la nouvelle
   (mouvement.css). Vers une autre page (une fiche créée), on y va comme on
   suit un lien. Sans script, rien ne change : le formulaire poste et la
   page revient, comme avant.

   Réussi, le geste remet le formulaire à l'état que le serveur vient de
   rendre (form.reset()) ; un formulaire tenu par un composant client
   remet son état sur l'événement reset (onReset). Refusé, tout ce qui a été
   saisi reste, pour corriger.

   Restent des envois ordinaires : la connexion et la double
   authentification, l'accès support (il change de session), les exports et
   les téléversements, tout formulaire marqué data-rechargement.

   Posés une fois, dans la coquille ; aucun formulaire n'a à s'en soucier.
   ========================================================================== */

/** L'envoi en place a commencé (ou fini) : la barre de progression court. */
const GESTE_EN_COURS = "skanecom:geste";
/** Lu par le proxy : la page de retour n'est pas rendue pour rien (src/proxy.ts). */
const EN_TETE_GESTE = "x-skanecom-geste";
const EXCLUS = /\/(export|session|support)(\/|$)|\/(analyser|envoyer|images|photos)$/;

type AvecTransitions = Document & {
  startViewTransition?: (miseAJour: () => Promise<void>) => { finished: Promise<void> };
};

/** L'adresse d'envoi. Par l'attribut, jamais par `form.action` : un champ
 *  nommé « action » (les gestes d'une commande en ont un) masque la
 *  propriété, qui rend alors le champ lui-même. Idem pour method et target. */
function adresseDe(form: HTMLFormElement): URL {
  return new URL(form.getAttribute("action") ?? "", window.location.href);
}

/** Ce formulaire peut-il s'envoyer sans recharger la page ? */
function enPlace(form: HTMLFormElement): boolean {
  if ((form.getAttribute("method") ?? "get").toLowerCase() !== "post" || form.dataset.rechargement !== undefined) return false;
  const cadre = form.getAttribute("target");
  if ((cadre && cadre !== "_self") || form.querySelector("input[type=file]")) return false;
  const url = adresseDe(form);
  return url.origin === window.location.origin && /^\/(gestion|boutiques)\//.test(url.pathname) && !EXCLUS.test(url.pathname);
}

/** Le repère que le serveur change à chaque rendu de la coquille (Coquille.tsx). */
const repere = () => document.querySelector("[data-rendu]")?.getAttribute("data-rendu") ?? null;

/** La page rafraîchie est posée : le repère n'est plus celui d'avant le
 *  geste (React pose tout un rendu d'un coup : l'observateur le voit fini).
 *  Au-delà du délai, on n'attend plus. Pas d'attente d'une image
 *  (requestAnimationFrame) : pendant une transition de vue, le navigateur
 *  suspend l'affichage jusqu'à ce que cette promesse soit tenue — elle ne
 *  le serait qu'à l'abandon de la transition, au bout de 4 s. */
function rendu(avant: string | null, delai: number): Promise<void> {
  return new Promise((resoudre) => {
    const observateur = new MutationObserver(() => {
      if (repere() !== avant) fin();
    });
    const minuterie = window.setTimeout(fin, delai);
    function fin() {
      observateur.disconnect();
      window.clearTimeout(minuterie);
      resoudre();
    }
    observateur.observe(document.body, { childList: true, subtree: true, attributeFilter: ["data-rendu"] });
  });
}

export function ProgressionNavigation() {
  const chemin = usePathname();
  const recherche = useSearchParams();
  const [etat, setEtat] = useState<"repos" | "court" | "fin">("repos");
  const premier = useRef(true);

  // La page suivante est là : la barre finit sa course et s'efface. (Un
  // geste en place change l'adresse avant que la page rafraîchie arrive :
  // c'est lui qui dira la fin.)
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return;
    }
    setEtat((e) => (document.documentElement.hasAttribute("data-geste") ? e : "fin"));
    const t = window.setTimeout(() => setEtat((e) => (e === "fin" ? "repos" : e)), 600);
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
    // Le geste en place (EnvoiFormulaires) : il dit quand il part et quand il
    // a fini — la page peut revenir à la même adresse.
    let fin = 0;
    const geste = (e: Event) => {
      window.clearTimeout(fin);
      if ((e as CustomEvent<{ fini?: boolean }>).detail?.fini) {
        setEtat("fin");
        fin = window.setTimeout(() => setEtat("repos"), 600);
      } else setEtat("court");
    };
    document.addEventListener("click", demarre);
    document.addEventListener("submit", envoi);
    window.addEventListener(GESTE_EN_COURS, geste);
    return () => {
      document.removeEventListener("click", demarre);
      document.removeEventListener("submit", envoi);
      window.removeEventListener(GESTE_EN_COURS, geste);
      window.clearTimeout(fin);
    };
  }, []);

  return <div className="ui-progression" data-etat={etat === "repos" ? undefined : etat} aria-hidden="true" />;
}

export function EnvoiFormulaires() {
  const router = useRouter();

  useEffect(() => {
    const reduit = matchMedia("(prefers-reduced-motion: reduce)");
    const libere = (form: HTMLFormElement, bouton: HTMLElement | null) => {
      delete form.dataset.envoi;
      if (bouton) {
        delete bouton.dataset.envoi;
        bouton.removeAttribute("aria-busy");
      }
    };
    const annonce = (fini: boolean) => window.dispatchEvent(new CustomEvent(GESTE_EN_COURS, { detail: { fini } }));

    /** L'envoi ordinaire, quand le serveur répond sans redirection (un refus
     *  avant toute écriture, une erreur) : la page affichera sa réponse telle
     *  quelle. */
    const ordinaire = (form: HTMLFormElement, submitter: HTMLElement | null) => {
      form.dataset.rechargement = "";
      delete form.dataset.envoi;
      form.requestSubmit(submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement ? submitter : undefined);
    };

    /** La connexion a coupé pendant l'envoi : rien n'est renvoyé à l'aveugle
     *  (le serveur a pu enregistrer avant la coupure), c'est dit sous le
     *  formulaire. */
    const coupure = (form: HTMLFormElement) => {
      const avis = document.createElement("p");
      avis.className = "message message-erreur geste-coupure";
      avis.setAttribute("role", "alert");
      avis.textContent = "La connexion a coupé pendant l'envoi. Rechargez la page pour voir s'il est passé avant de recommencer.";
      form.after(avis);
    };

    const envoieEnPlace = async (form: HTMLFormElement, submitter: HTMLElement | null, bouton: HTMLElement | null) => {
      annonce(false);
      if (form.nextElementSibling?.classList.contains("geste-coupure")) form.nextElementSibling.remove();
      document.querySelectorAll(".geste-refus").forEach((n) => n.remove());
      // Le bouton pressé porte souvent le geste (name="resultat" value="confirmee") :
      // FormData(form) ne le lit pas, il s'ajoute à la main.
      const donnees = new FormData(form);
      if ((submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) && submitter.name) {
        donnees.append(submitter.name, submitter.value);
      }
      let reponse: Response;
      try {
        reponse = await fetch(adresseDe(form), { method: "POST", body: donnees, credentials: "same-origin", headers: { [EN_TETE_GESTE]: "1" } });
      } catch {
        coupure(form);
        libere(form, bouton);
        annonce(true);
        return;
      }
      const retourUrl = new URL(reponse.url);
      if (!reponse.redirected || retourUrl.origin !== window.location.origin) return ordinaire(form, submitter);

      // Une autre page (une fiche créée, la liste après un retrait) : on y
      // va comme on suit un lien, la page entière. Le geste reste « en
      // cours » jusqu'à ce qu'elle remplace celle-ci.
      if (retourUrl.pathname !== window.location.pathname) {
        window.location.assign(retourUrl.pathname + retourUrl.search);
        return new Promise<void>(() => {});
      }

      // La même page, à l'adresse de retour (le message du geste) : le
      // serveur la rend entière, sans cache (router.refresh), et elle garde
      // sa place. Le fragment (#t-poids) reste : le serveur ne le voit pas.
      // Celui que le serveur désigne (?ancre=code-…) devient le fragment :
      // fetch ne rapporte jamais celui d'une redirection.
      const ancreDemandee = retourUrl.searchParams.get("ancre");
      if (ancreDemandee) retourUrl.searchParams.delete("ancre");
      const cible = retourUrl.pathname + retourUrl.search + (ancreDemandee ? `#${ancreDemandee}` : retourUrl.hash || window.location.hash);
      const avant = repere();
      const miseAJour = async () => {
        if (cible !== window.location.pathname + window.location.search + window.location.hash) {
          window.history.replaceState(null, "", cible);
        }
        router.refresh();
        await rendu(avant, 3000);
      };

      const doc = document as AvecTransitions;
      if (typeof doc.startViewTransition === "function" && !reduit.matches) {
        const racine = document.documentElement;
        racine.dataset.vtGeste = "";
        // La ligne du geste (qu'on monte, qu'on descend) passe au-dessus de
        // celles qu'elle croise (mouvement.css).
        const ligne = form.closest<HTMLElement>("li, tr");
        if (ligne) ligne.dataset.vtLigneGeste = "";
        await doc.startViewTransition(miseAJour).finished.catch(() => {});
        delete racine.dataset.vtGeste;
        if (ligne) delete ligne.dataset.vtLigneGeste;
      } else {
        await miseAJour();
      }
      libere(form, bouton);
      annonce(true);

      // Réussi, le geste laisse le formulaire comme un rechargement l'aurait
      // laissé : ses champs aux valeurs que le serveur vient de rendre, le pli
      // qui le contenait refermé (le focus revient à son titre). Refusé
      // (?erreur=), tout reste en place pour corriger.
      let focus: HTMLElement | null = null;
      if (!retourUrl.searchParams.has("erreur") && form.isConnected) {
        form.reset();
        const pli = form.parentElement?.closest("details");
        if (pli?.open) {
          if (pli.contains(document.activeElement)) focus = pli.querySelector<HTMLElement>(":scope > summary");
          pli.open = false;
        }
      }

      // Refusé, le formulaire reste où il est. Si le refus s'affiche hors de
      // l'écran (en tête de page, le formulaire plus bas), il est redit près
      // du bouton, là où l'on regarde : au-dessus du pied de carte s'il y en
      // a un, sinon sous le formulaire. Sans rôle d'alerte : celui d'en haut
      // est déjà lu par les lecteurs d'écran.
      if (retourUrl.searchParams.has("erreur") && form.isConnected) {
        const refus = document.querySelector<HTMLElement>("#principal .message-erreur[role=alert]");
        const r = refus?.getBoundingClientRect();
        if (refus && r && !refus.contains(form) && (r.bottom < 0 || r.top > window.innerHeight)) {
          const rappel = document.createElement("p");
          rappel.className = "message message-erreur geste-refus";
          rappel.textContent = refus.textContent;
          const pied = form.querySelector(":scope > .carte-pied");
          if (pied) pied.before(rappel);
          else form.after(rappel);
        }
      }

      // Le serveur dit où regarder (?ancre=code-…) et ce n'est pas là où le geste
      // s'est fait : un code créé du formulaire du bas apparaît dans la liste,
      // un code coupé change de section. L'écran y va, le focus aussi, et la
      // ligne se signale un instant — sinon on ne verrait pas ce qui a changé.
      const ancre = ancreDemandee ? document.getElementById(ancreDemandee) : null;
      if (ancre && !retourUrl.searchParams.has("erreur") && !(form.isConnected && ancre.contains(form))) {
        const r = ancre.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) ancre.scrollIntoView({ block: "center", behavior: reduit.matches ? "auto" : "smooth" });
        if (!ancre.hasAttribute("tabindex")) ancre.setAttribute("tabindex", "-1");
        ancre.focus({ preventScroll: true });
        ancre.dataset.gesteCible = "";
        window.setTimeout(() => delete ancre.dataset.gesteCible, 1800);
        return;
      }

      // Sinon, le focus reste où il était s'il existe encore, ou passe au
      // message (réussite ou refus) que la page vient d'afficher — l'écran
      // défile jusqu'à lui s'il n'est pas en vue.
      const actif = document.activeElement;
      if (!focus && (!actif || actif === document.body || !actif.isConnected)) {
        focus = document.querySelector<HTMLElement>("#principal .message, #principal [role=alert], #principal [role=status]");
        if (focus && !focus.hasAttribute("tabindex")) focus.setAttribute("tabindex", "-1");
      }
      focus?.focus();
    };

    const envoi = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (e.defaultPrevented) return;
      if (form.dataset.envoi) {
        e.preventDefault(); // déjà parti : un second clic n'envoie rien
        return;
      }
      form.dataset.envoi = "1";
      const bouton = (e.submitter as HTMLElement | null) ?? form.querySelector<HTMLElement>("button[type=submit], button:not([type])");
      const marque = bouton?.classList.contains("btn") ? bouton : null;
      if (marque) {
        marque.dataset.envoi = "1";
        marque.setAttribute("aria-busy", "true");
      }
      if (!enPlace(form)) return;
      e.preventDefault();
      // Le temps du geste, <html data-geste> : la page le sait (et les essais aussi).
      const racine = document.documentElement;
      racine.dataset.geste = "";
      void envoieEnPlace(form, e.submitter as HTMLElement | null, marque).finally(() => delete racine.dataset.geste);
    };
    // Retour arrière (cache du navigateur) : les formulaires redeviennent libres.
    const retour = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      delete document.documentElement.dataset.geste;
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
  }, [router]);
  return null;
}
