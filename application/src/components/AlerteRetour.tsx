"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Cloche, Coche } from "./Icones";
import { t } from "@/lib/i18n";

/* ============================================================================
   « PRÉVENEZ-MOI DE SON RETOUR » — sur une déclinaison épuisée (ou sous son
   minimum de commande), si la boutique le propose (réglage
   catalogue.prevenir_retour). Un bouton, puis un seul champ : le téléphone
   (ou l'e-mail, au choix) ; la base note la demande et la garde tant que la
   pièce n'est pas revenue (public.demander_alerte_retour). Le contact ne sert
   qu'à ce message, et s'efface une fois la personne prévenue.
   Une déclinaison, une demande : le composant est remonté à chaque
   déclinaison choisie (key).
   ========================================================================== */

type Reponse = { ok: true; deja: boolean } | { ok: false; raison: string; message?: string };

export function AlerteRetour({ varianteId }: { varianteId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [canal, setCanal] = useState<"telephone" | "email">("telephone");
  const [valeur, setValeur] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [notee, setNotee] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  const reponse = useRef<HTMLParagraphElement>(null);
  const focusChamp = useRef(false);

  // Le champ prend le focus quand on l'ouvre ou qu'on change de canal ; la
  // réponse, quand elle remplace le formulaire (un lecteur d'écran la lit).
  useLayoutEffect(() => {
    if (notee) reponse.current?.focus();
    else if (focusChamp.current) {
      focusChamp.current = false;
      champ.current?.focus();
    }
  }, [ouvert, canal, notee]);

  if (notee) {
    return (
      <p className="alerte-retour-notee" role="status" tabIndex={-1} ref={reponse}>
        <Coche taille={16} /> <span>{notee}</span>
      </p>
    );
  }

  if (!ouvert) {
    return (
      <button type="button" className="btn btn-second btn-bloc alerte-retour-ouvrir" onClick={() => { focusChamp.current = true; setOuvert(true); }}>
        <Cloche taille={17} /> {t.alerte.ouvrir}
      </button>
    );
  }

  const parTelephone = canal === "telephone";
  const change = () => {
    focusChamp.current = true;
    setErreur(null);
    setValeur("");
    setCanal(parTelephone ? "email" : "telephone");
  };

  const pret = parTelephone ? valeur.replace(/\D/g, "").length >= 8 : /\S+@\S+\.\S+/.test(valeur);

  async function envoie(e: React.FormEvent) {
    e.preventDefault();
    if (enCours) return;
    // Un numéro incomplet, une adresse sans @ : dit tout de suite, sous le champ.
    if (!pret) {
      setErreur(parTelephone ? t.alerte.saisieTelephone : t.alerte.saisieEmail);
      champ.current?.focus();
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      const r = await fetch("/alerte-retour", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variante_id: varianteId, [canal]: valeur }),
      });
      const d = (await r.json()) as Reponse;
      if (d.ok) {
        const contact = parTelephone ? lisible(valeur) : valeur.trim();
        setNotee(d.deja ? t.alerte.deja(contact) : t.alerte.notee(contact, parTelephone));
      } else {
        setErreur(d.message ?? t.alerte.erreur);
        champ.current?.focus();
      }
    } catch {
      setErreur(t.alerte.erreur);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form className="alerte-retour" onSubmit={envoie} noValidate>
      <p className="alerte-retour-titre">{t.alerte.titre}</p>
      <div className="champ">
        <label htmlFor={`alerte-${varianteId}`}>{parTelephone ? t.alerte.telephone : t.alerte.email}</label>
        {parTelephone ? (
          <div className="tunnel-tel" data-invalide={erreur ? "" : undefined}>
            <span aria-hidden="true">{t.commande.indicatif}</span>
            <input
              ref={champ}
              id={`alerte-${varianteId}`}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              placeholder="20 123 456"
              value={valeur}
              onChange={(e) => setValeur(e.target.value.slice(0, 20))}
              aria-invalid={erreur ? true : undefined}
              aria-describedby={`alerte-${varianteId}-aide`}
            />
          </div>
        ) : (
          <input
            ref={champ}
            id={`alerte-${varianteId}`}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="vous@exemple.tn"
            value={valeur}
            onChange={(e) => setValeur(e.target.value.slice(0, 200))}
            aria-invalid={erreur ? true : undefined}
            aria-describedby={`alerte-${varianteId}-aide`}
          />
        )}
        <p id={`alerte-${varianteId}-aide`} className="legende">{t.alerte.discret}</p>
      </div>
      {erreur ? <p className="tunnel-alerte" role="alert">{erreur}</p> : null}
      <div className="alerte-retour-gestes">
        <button type="submit" className="btn btn-primaire" disabled={enCours} aria-busy={enCours || undefined}>
          {enCours ? t.alerte.envoi : t.alerte.envoyer}
        </button>
        <button type="button" className="btn-lien legende" onClick={change}>
          {parTelephone ? t.alerte.parEmail : t.alerte.parTelephone}
        </button>
      </div>
    </form>
  );
}

/** « 20123456 » → « 20 123 456 » : le numéro tel qu'on le lit. */
function lisible(saisi: string): string {
  const c = saisi.replace(/\D/g, "").replace(/^216(?=\d{8}$)/, "");
  return c.length === 8 ? `${c.slice(0, 2)} ${c.slice(2, 5)} ${c.slice(5)}` : saisi.trim();
}
