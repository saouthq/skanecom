"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { Icone } from "./Icone";
import { urlFichier } from "@/lib/photos";
import type { ProduitReception } from "@/lib/gestion/reception";

/* ============================================================================
   LA RÉCEPTION D'UN ARRIVAGE — toutes les déclinaisons en vente, produit par
   produit : on tape la quantité reçue en face de chacune (Entrée passe à la
   suivante, au lieu d'envoyer), le nouveau stock s'affiche, le total de
   l'arrivage suit en bas de l'écran avec la note du bon de livraison.
   Un filtre (nom, marque, référence) pour aller droit aux valises reçues.

   Un formulaire HTML ordinaire : sans JavaScript, on saisit et on envoie.
   Envoyé en place (Retours.tsx), la réception enregistrée remet le
   formulaire à zéro (onReset) : les quantités se vident — rien ne part deux
   fois —, le filtre reste, sur les stocks qui viennent de monter.
   ========================================================================== */

const QUANTITE = /^\d{1,6}$/;

export function FormReception({ action, produits }: { action: string; produits: ProduitReception[] }) {
  const [quantites, setQuantites] = useState<Record<string, string>>({});
  const [filtre, setFiltre] = useState("");

  const cherche = filtre.trim().toLowerCase();
  const visibles = useMemo(
    () =>
      produits.filter(
        (p) =>
          !cherche ||
          [p.nom, p.marque ?? "", ...p.variantes.map((v) => `${v.sku} ${v.libelle ?? ""}`)].some((x) => x.toLowerCase().includes(cherche)),
      ),
    [produits, cherche],
  );

  const saisies = Object.entries(quantites).filter(([, q]) => QUANTITE.test(q) && Number(q) > 0);
  const pieces = saisies.reduce((s, [, q]) => s + Number(q), 0);
  const invalides = Object.values(quantites).filter((q) => q !== "" && !QUANTITE.test(q)).length;

  // Entrée : la déclinaison suivante (on saisit un bon de livraison ligne à ligne).
  const suivante = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    // Les produits masqués par le filtre sont sautés.
    const champs = [...document.querySelectorAll<HTMLInputElement>(".rc-quantite")].filter((c) => c.offsetParent !== null);
    champs[champs.indexOf(e.currentTarget) + 1]?.focus();
  };

  return (
    <form method="post" action={action} className="rc-form" onReset={() => setQuantites({})}>
      <div className="rc-filtre">
        <span className="bo-recherche-champ">
          <Icone nom="recherche" />
          <input type="search" className="entree" value={filtre} onChange={(e) => setFiltre(e.target.value)}
                 placeholder="Filtrer : nom, marque ou référence" aria-label="Filtrer les produits" autoComplete="off" />
        </span>
      </div>

      <div className="rc-produits">
        {produits.map((p) => (
          <section key={p.id} className="carte rc-produit" hidden={!visibles.includes(p)} aria-labelledby={`rc-${p.id}`}>
            <div className="rc-produit-tete">
              <span className="rc-vignette" aria-hidden="true">
                {p.image ? <Image src={urlFichier(p.image)} alt="" fill sizes="44px" /> : <Icone nom="colis" taille={18} />}
              </span>
              <h2 id={`rc-${p.id}`} className="rc-produit-nom">
                {p.nom}
                {p.marque ? <span className="discret"> · {p.marque}</span> : null}
              </h2>
              {!p.publie ? <span className="ui-etat">Brouillon</span> : null}
            </div>
            <ul className="rc-lignes">
              {p.variantes.map((v) => {
                const q = quantites[v.id] ?? "";
                const lisible = QUANTITE.test(q) && Number(q) > 0;
                const bas = v.seuil !== null && v.stock <= v.seuil;
                return (
                  <li key={v.id} className="rc-ligne" data-saisie={lisible ? "" : undefined} data-invalide={q && !QUANTITE.test(q) ? "" : undefined}>
                    <label htmlFor={`q-${v.id}`} className="rc-quoi">
                      <b>{v.libelle || "Modèle unique"}</b>
                      <span className="discret tabular-nums">{v.sku}</span>
                    </label>
                    <span className={`rc-stock tabular-nums${bas ? " rc-stock-bas" : ""}`}>
                      {v.stock} en stock
                      {lisible ? <span className="rc-apres"> → {v.stock + Number(q)}</span> : null}
                    </span>
                    <input
                      id={`q-${v.id}`}
                      name={`q:${v.id}`}
                      className="entree rc-quantite tabular-nums"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="0"
                      value={q}
                      onChange={(e) => setQuantites((avant) => ({ ...avant, [v.id]: e.target.value.replace(/\s/g, "") }))}
                      onKeyDown={suivante}
                      aria-label={`Quantité reçue : ${p.nom}${v.libelle ? `, ${v.libelle}` : ""}`}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {visibles.length === 0 ? <p className="discret rc-rien">Aucun produit ne correspond à « {filtre} ».</p> : null}
      </div>

      <div className="rc-barre">
        <p className="rc-total" aria-live="polite">
          {saisies.length === 0 ? (
            "Tapez les quantités reçues."
          ) : (
            <>
              <b className="tabular-nums">{pieces}</b> pièce{pieces > 1 ? "s" : ""} sur <b className="tabular-nums">{saisies.length}</b> déclinaison{saisies.length > 1 ? "s" : ""}
            </>
          )}
          {invalides ? <span className="rc-invalide"> · {invalides} quantité{invalides > 1 ? "s" : ""} illisible{invalides > 1 ? "s" : ""}</span> : null}
        </p>
        <input name="note" className="entree rc-note" maxLength={300} placeholder="Note : n° du bon de livraison, fournisseur…" aria-label="Note de la réception" />
        <button type="submit" className="btn btn-primaire" disabled={saisies.length === 0 || invalides > 0}>
          <Icone nom="colis" taille={16} /> Enregistrer la réception
        </button>
      </div>
    </form>
  );
}
