"use client";

import Link from "next/link";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Coche } from "./Icones";
import { t } from "@/lib/i18n";

/* ============================================================================
   LA LETTRE, AU PIED DE PAGE (réglage vitrine.lettre) — l'adresse, une case
   à cocher (jamais cochée d'avance : c'est l'accord de la personne, gardé
   tel qu'écrit), « S'inscrire ». Rien ne part avant la confirmation par le
   lien reçu : la réponse le dit, et la même, que l'adresse soit déjà
   inscrite ou non. Un refus s'affiche sous le champ en cause.
   ========================================================================== */

type Reponse = { ok: true } | { ok: false; raison: string; message?: string };

export function LettreInscription({ boutique, accroche, classe }: { boutique: string; accroche: string | null; classe: string }) {
  const id = useId();
  const chemin = usePathname();
  const [email, setEmail] = useState("");
  const [accepte, setAccepte] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [envoyee, setEnvoyee] = useState<string | null>(null);
  const [erreur, setErreur] = useState<{ champ: "email" | "consentement" | null; texte: string } | null>(null);
  const champEmail = useRef<HTMLInputElement>(null);
  const caseAccord = useRef<HTMLInputElement>(null);
  const merci = useRef<HTMLParagraphElement>(null);

  // La réponse prend le focus quand elle remplace le formulaire (posé quand
  // React l'attache : un requestAnimationFrame pouvait passer avant).
  useLayoutEffect(() => {
    if (envoyee) merci.current?.focus();
  }, [envoyee]);

  async function inscrire(e: React.FormEvent) {
    e.preventDefault();
    if (enCours) return;
    const adresse = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adresse)) {
      setErreur({ champ: "email", texte: t.lettre.illisible });
      champEmail.current?.focus();
      return;
    }
    if (!accepte) {
      setErreur({ champ: "consentement", texte: t.lettre.cochez });
      caseAccord.current?.focus();
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      const r = await fetch("/lettre/inscription", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: adresse, accepte, page: chemin }),
      });
      const d = (await r.json()) as Reponse;
      if (d.ok) {
        setEnvoyee(adresse);
      } else if (d.raison === "email" || d.raison === "consentement") {
        setErreur({ champ: d.raison, texte: d.message ?? t.lettre.erreur });
        (d.raison === "email" ? champEmail : caseAccord).current?.focus();
      } else {
        setErreur({ champ: null, texte: d.raison === "envoi" ? t.lettre.indisponible : (d.message ?? t.lettre.erreur) });
      }
    } catch {
      setErreur({ champ: null, texte: t.lettre.erreur });
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className={`lettre ${classe}`} aria-labelledby={`${id}-titre`}>
      <div className="lettre-tete">
        <p id={`${id}-titre`} className="lettre-titre">{t.lettre.titre}</p>
        <p className="lettre-accroche">{accroche ?? t.lettre.accroche}</p>
      </div>
      {envoyee ? (
        <p className="lettre-merci" ref={merci} tabIndex={-1} role="status">
          <Coche taille={18} />
          <span>{t.lettre.attente(envoyee)}</span>
        </p>
      ) : (
        // L'ordre du clavier : l'adresse, l'accord, puis « S'inscrire » (que la
        // grille pose à côté du champ sur un écran large).
        <form className="lettre-form" onSubmit={inscrire} noValidate>
          <label htmlFor={`${id}-email`} className="sr-only">{t.lettre.champNom}</label>
          <input
            ref={champEmail}
            id={`${id}-email`}
            className="lettre-champ"
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            placeholder={t.lettre.champ}
            value={email}
            onChange={(e) => { setEmail(e.target.value.slice(0, 200)); if (erreur?.champ === "email") setErreur(null); }}
            aria-invalid={erreur?.champ === "email" || undefined}
            aria-describedby={erreur?.champ === "email" ? `${id}-erreur` : undefined}
            required
          />
          <label className="lettre-accord">
            <input
              ref={caseAccord}
              type="checkbox"
              name="accepte"
              checked={accepte}
              onChange={(e) => { setAccepte(e.target.checked); if (erreur?.champ === "consentement") setErreur(null); }}
              aria-invalid={erreur?.champ === "consentement" || undefined}
              aria-describedby={erreur?.champ === "consentement" ? `${id}-erreur` : undefined}
              required
            />
            <span>
              {t.lettre.consentement(boutique)}{" "}
              <Link href="/confidentialite#lettre" className="lettre-donnees">{t.lettre.donnees}</Link>
            </span>
          </label>
          {erreur ? <p id={`${id}-erreur`} className="lettre-erreur" role="alert">{erreur.texte}</p> : null}
          <button type="submit" className="btn btn-primaire lettre-bouton" disabled={enCours} aria-busy={enCours || undefined}>
            {enCours ? t.lettre.envoi : t.lettre.bouton}
          </button>
        </form>
      )}
    </section>
  );
}
