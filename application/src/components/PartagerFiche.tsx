"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Coche, Facebook, Lien, LogoWhatsApp, Partager } from "./Icones";
import { t } from "@/lib/i18n";

/* ============================================================================
   « PARTAGER » SUR LA FICHE (réglage vitrine.partage) — au téléphone, la
   feuille de partage du système (WhatsApp, Messenger, SMS… ce que la
   personne a) ; ailleurs, ou si elle n'existe pas, un petit menu sous le
   bouton : WhatsApp, Facebook, « Copier le lien ». Le lien est celui de la
   fiche, sans paramètre ; son aperçu (photo, nom, prix) vient des balises
   de la page. Rien n'est gardé : tout se passe dans le navigateur.

   Le menu : un bouton qui l'ouvre (aria-expanded), Échap ou un clic ailleurs
   le referme, le focus revient au bouton.
   ========================================================================== */

export function PartagerFiche({ nom, boutique }: { nom: string; boutique: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [copie, setCopie] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);
  const boite = useRef<HTMLDivElement>(null);
  const id = useId();

  const adresse = () => `${location.origin}${location.pathname}`;
  const message = t.partage.message(nom, boutique);

  useEffect(() => {
    if (!ouvert) return;
    const ailleurs = (e: PointerEvent) => {
      if (!boite.current?.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOuvert(false);
      bouton.current?.focus();
    };
    document.addEventListener("pointerdown", ailleurs);
    document.addEventListener("keydown", echap);
    return () => {
      document.removeEventListener("pointerdown", ailleurs);
      document.removeEventListener("keydown", echap);
    };
  }, [ouvert]);

  async function partager() {
    // Au doigt, la feuille du système quand elle existe ; à la souris, le menu.
    const auDoigt = matchMedia("(pointer: coarse)").matches;
    if (auDoigt && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: nom, text: message, url: adresse() });
        return;
      } catch (e) {
        // Refermée par la personne : rien de plus. Refusée par le navigateur : le menu.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    setCopie(false);
    setOuvert((o) => !o);
  }

  async function copier() {
    const lien = adresse();
    try {
      await navigator.clipboard.writeText(lien);
    } catch {
      // Sans presse-papiers (navigateur ancien, page non sûre) : l'ancienne façon.
      const zone = document.createElement("textarea");
      zone.value = lien;
      zone.setAttribute("readonly", "");
      zone.style.position = "fixed";
      zone.style.opacity = "0";
      document.body.append(zone);
      zone.select();
      document.execCommand("copy");
      zone.remove();
    }
    setCopie(true);
  }

  return (
    <div className="partage" ref={boite}>
      <button
        ref={bouton}
        type="button"
        className="btn-lien partage-bouton"
        aria-expanded={ouvert}
        aria-controls={id}
        aria-label={t.partage.boutonAria(nom)}
        onClick={() => void partager()}
      >
        <Partager taille={16} />
        <span>{t.partage.bouton}</span>
      </button>
      {ouvert ? (
        <ul id={id} className="partage-menu" role="list">
          <li>
            <a className="partage-choix" href={`https://wa.me/?text=${encodeURIComponent(`${message} ${adresse()}`)}`} target="_blank" rel="noopener noreferrer">
              <LogoWhatsApp taille={16} />
              {t.partage.whatsapp}
            </a>
          </li>
          <li>
            <a className="partage-choix" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(adresse())}`} target="_blank" rel="noopener noreferrer">
              <Facebook taille={16} />
              {t.partage.facebook}
            </a>
          </li>
          <li>
            <button type="button" className="partage-choix" onClick={() => void copier()} data-copie={copie ? "" : undefined}>
              {copie ? <Coche taille={16} /> : <Lien taille={16} />}
              {copie ? t.partage.copie : t.partage.copier}
            </button>
          </li>
        </ul>
      ) : null}
      <p className="sr-only" aria-live="polite">{copie ? t.partage.copie : ""}</p>
    </div>
  );
}
