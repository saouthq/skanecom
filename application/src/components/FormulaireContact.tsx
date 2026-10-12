"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Coche, Fleche } from "./Icones";
import { Roule } from "./SectionsVitrine";
import { t } from "@/lib/i18n";

/* ============================================================================
   LE FORMULAIRE DE CONTACT (réglage vitrine.formulaire_contact) — sur la
   page Contact, dans la section « Contact » de l'accueil, sur la fiche d'une
   réalisation (« Écrire à propos de ce projet »). Nom, téléphone ou e-mail,
   l'objet (les choix de la boutique), le message ; la fiche d'où l'on écrit
   part avec. La demande arrive au backoffice (Demandes), l'équipe en reçoit
   un e-mail (app/_b/[boutique]/contact/envoyer).

   · sans JavaScript, le bouton reste un vrai bouton : le formulaire poste
     au même point (réponse rendue comme une page) ;
   · un refus de la base se dit sous son champ, le focus y va ;
   · envoyée, la demande laisse un remerciement qui prend le focus (lu par
     les lecteurs d'écran), et de quoi en écrire une autre ;
   · un champ piège, invisible et hors du clavier, arrête les robots qui
     remplissent tout ; il ne gêne personne d'autre.
   · dans l'aperçu de l'éditeur, rien ne part : on voit le formulaire.
   ========================================================================== */

type Champ = "nom" | "telephone" | "email" | "sujet" | "message";
const CHAMPS = new Set<Champ>(["nom", "telephone", "email", "sujet", "message"]);

export function FormulaireContact({
  boutique,
  sujets,
  produit = null,
  apercu = false,
  confidentialite = true,
  id,
}: {
  boutique: string;
  /** Les objets proposés (réglage vitrine.contact_sujets) ; vide : pas de choix. */
  sujets: string[];
  /** La fiche d'où l'on écrit (une réalisation, un produit). */
  produit?: { slug: string; nom: string } | null;
  /** L'aperçu de l'éditeur de la vitrine : on montre, on n'envoie pas. */
  apercu?: boolean;
  /** La page Confidentialité existe (identité légale de la boutique). */
  confidentialite?: boolean;
  id?: string;
}) {
  const base = useId();
  const [etat, setEtat] = useState<"saisie" | "envoi" | "envoyee">("saisie");
  const [erreur, setErreur] = useState<{ champ: Champ | null; message: string } | null>(null);
  const [numero, setNumero] = useState<string | null>(null);
  // L'heure où le formulaire paraît : un envoi en moins de deux secondes est un robot.
  const depart = useRef(0);
  useEffect(() => { depart.current = Date.now(); }, []);
  const formulaire = useRef<HTMLFormElement>(null);
  const merci = useRef<HTMLHeadingElement>(null);

  const idDe = (c: string) => `${base}-${c}`;

  async function envoyer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (etat === "envoi" || apercu) return;
    const f = new FormData(e.currentTarget);
    setErreur(null);
    setEtat("envoi");
    try {
      const r = await fetch("/contact/envoyer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nom: f.get("nom"), telephone: f.get("telephone"), email: f.get("email"), sujet: f.get("sujet"), message: f.get("message"),
          produit: produit?.slug ?? null, page: window.location.pathname, site: f.get("site"), duree: Date.now() - depart.current,
        }),
      });
      const corps = (await r.json().catch(() => null)) as { ok?: boolean; numero?: string; champ?: string; message?: string } | null;
      if (r.ok && corps?.ok) {
        setNumero(corps.numero ?? null);
        setEtat("envoyee");
        requestAnimationFrame(() => merci.current?.focus());
        return;
      }
      const champ = corps?.champ && CHAMPS.has(corps.champ as Champ) ? (corps.champ as Champ) : null;
      setErreur({ champ, message: corps?.message || t.formulaire.erreur });
      setEtat("saisie");
      requestAnimationFrame(() => {
        const cible = champ ? formulaire.current?.querySelector<HTMLElement>(`[name="${champ}"]`) : null;
        cible?.focus();
      });
    } catch {
      setErreur({ champ: null, message: t.formulaire.erreur });
      setEtat("saisie");
    }
  }

  if (etat === "envoyee") {
    return (
      <div className="fc-merci" id={id}>
        <span className="fc-merci-icone" aria-hidden="true"><Coche taille={22} /></span>
        <h3 ref={merci} tabIndex={-1}>{t.formulaire.merciTitre}</h3>
        <p>{t.formulaire.merciTexte(boutique, numero)}</p>
        <button type="button" className="btn-lien" onClick={() => { setEtat("saisie"); depart.current = Date.now(); }}>
          {t.formulaire.autre}
        </button>
      </div>
    );
  }

  const aide = (c: Champ) => (erreur?.champ === c ? (
    <p className="fc-erreur" id={idDe(`${c}-erreur`)} role="alert">{erreur.message}</p>
  ) : null);
  const decrit = (c: Champ, aussi?: string) => [erreur?.champ === c ? idDe(`${c}-erreur`) : null, aussi].filter(Boolean).join(" ") || undefined;

  return (
    <form ref={formulaire} className="fc-formulaire" id={id} method="post" action="/contact/envoyer" onSubmit={envoyer} noValidate
      aria-busy={etat === "envoi" || undefined}>
      {produit ? <p className="fc-a-propos">{t.formulaire.aPropos(produit.nom)}</p> : null}
      {produit ? <input type="hidden" name="produit" value={produit.slug} /> : null}
      <div className="fc-champ">
        <label htmlFor={idDe("nom")}>{t.formulaire.nom}</label>
        <input id={idDe("nom")} name="nom" autoComplete="name" required maxLength={80}
          aria-invalid={erreur?.champ === "nom" || undefined} aria-describedby={decrit("nom")} />
        {aide("nom")}
      </div>
      <div className="fc-rang">
        <div className="fc-champ">
          <label htmlFor={idDe("telephone")}>{t.formulaire.telephone}</label>
          <input id={idDe("telephone")} name="telephone" type="tel" inputMode="tel" autoComplete="tel" maxLength={24}
            aria-invalid={erreur?.champ === "telephone" || undefined} aria-describedby={decrit("telephone", idDe("un-des-deux"))} />
          {aide("telephone")}
        </div>
        <div className="fc-champ">
          <label htmlFor={idDe("email")}>{t.formulaire.email}</label>
          <input id={idDe("email")} name="email" type="email" inputMode="email" autoComplete="email" maxLength={200}
            aria-invalid={erreur?.champ === "email" || undefined} aria-describedby={decrit("email", idDe("un-des-deux"))} />
          {aide("email")}
        </div>
      </div>
      <p className="fc-aide" id={idDe("un-des-deux")}>{t.formulaire.unDesDeux}</p>
      {sujets.length ? (
        <div className="fc-champ">
          <label htmlFor={idDe("sujet")}>{t.formulaire.sujet}</label>
          <select id={idDe("sujet")} name="sujet" defaultValue="" aria-invalid={erreur?.champ === "sujet" || undefined} aria-describedby={decrit("sujet")}>
            <option value="">{t.formulaire.sujetChoisir}</option>
            {sujets.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {aide("sujet")}
        </div>
      ) : null}
      <div className="fc-champ">
        <label htmlFor={idDe("message")}>{t.formulaire.message}</label>
        <textarea id={idDe("message")} name="message" rows={5} required minLength={10} maxLength={2000}
          aria-invalid={erreur?.champ === "message" || undefined} aria-describedby={decrit("message", idDe("message-aide"))} />
        <p className="fc-aide" id={idDe("message-aide")}>{t.formulaire.messageAide}</p>
        {aide("message")}
      </div>
      {/* Le piège à robots : invisible, hors du clavier et des lecteurs d'écran. */}
      <div className="fc-piege" aria-hidden="true">
        <label htmlFor={idDe("site")}>Site</label>
        <input id={idDe("site")} name="site" tabIndex={-1} autoComplete="off" />
      </div>
      {erreur && !erreur.champ ? <p className="fc-erreur fc-erreur-generale" role="alert">{erreur.message}</p> : null}
      <div className="fc-pied">
        <button type="submit" className="btn btn-primaire fc-envoyer" disabled={etat === "envoi" || apercu} data-aimant="">
          <Roule>{etat === "envoi" ? t.formulaire.envoi : t.formulaire.envoyer}</Roule>
          <Fleche taille={16} className="icone-fleche rtl:-scale-x-100" />
        </button>
        <p className="fc-mention">
          {t.formulaire.mention(boutique)}
          {confidentialite ? <> <Link className="lien-souligne" href="/confidentialite">{t.formulaire.confidentialite}</Link></> : null}
        </p>
      </div>
    </form>
  );
}
