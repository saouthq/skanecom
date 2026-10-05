"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { Icone } from "./Icone";
import { urlFichier } from "@/lib/photos";
import type { ProduitReception } from "@/lib/gestion/reception";
import type { Arrivage } from "@/lib/gestion/arrivages";

/* ============================================================================
   ANNONCER UN ARRIVAGE (ou le changer tant qu'il est attendu) — son nom, sa
   date prévue, une note, puis la quantité attendue en face de chaque
   déclinaison : la même liste que la réception (Entrée passe à la suivante),
   avec un filtre et « les épuisées seulement » — celles qui se
   précommanderont dès l'annonce si le réglage est allumé.

   Un formulaire HTML ordinaire (`q:<id>`, comme la réception) : sans
   JavaScript, on saisit et on envoie.
   ========================================================================== */

const QUANTITE = /^\d{1,6}$/;

export function FormArrivage({ action, produits, arrivage, aujourdhui, suffixe }: {
  action: string;
  produits: ProduitReception[];
  /** Changer un arrivage attendu : ses champs et ses quantités partent de là. */
  arrivage?: Arrivage;
  /** AAAA-MM-JJ à Tunis : une annonce ne se fait pas pour hier. */
  aujourdhui: string;
  suffixe: string;
}) {
  const [quantites, setQuantites] = useState<Record<string, string>>(
    () => Object.fromEntries((arrivage?.lignes ?? []).map((l) => [l.variante_id, String(l.quantite)])),
  );
  const [filtre, setFiltre] = useState("");
  const [epuisees, setEpuisees] = useState(false);

  const cherche = filtre.trim().toLowerCase();
  const visibles = useMemo(
    () =>
      produits.filter(
        (p) =>
          (!epuisees || p.variantes.some((v) => v.stock <= 0 || quantites[v.id])) &&
          (!cherche ||
            [p.nom, p.marque ?? "", ...p.variantes.map((v) => `${v.sku} ${v.libelle ?? ""}`)].some((x) => x.toLowerCase().includes(cherche))),
      ),
    // Les quantités ne refont pas la liste : une valeur tapée n'escamote pas sa ligne.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [produits, cherche, epuisees],
  );

  const saisies = Object.entries(quantites).filter(([, q]) => QUANTITE.test(q) && Number(q) > 0);
  const pieces = saisies.reduce((s, [, q]) => s + Number(q), 0);
  const invalides = Object.values(quantites).filter((q) => q !== "" && !QUANTITE.test(q)).length;
  const stockDe = new Map(produits.flatMap((p) => p.variantes.map((v) => [v.id, v.stock] as const)));
  const aPrecommander = saisies.filter(([id]) => (stockDe.get(id) ?? 0) <= 0).length;

  const suivante = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    // Les produits masqués par le filtre sont sautés.
    const champs = [...(e.currentTarget.form?.querySelectorAll<HTMLInputElement>(".rc-quantite") ?? [])].filter((c) => c.offsetParent !== null);
    champs[champs.indexOf(e.currentTarget) + 1]?.focus();
  };

  const id = (x: string) => `${x}-${suffixe}`;

  return (
    <form method="post" action={action} className="rc-form ar-form" onReset={() => setQuantites({})}>
      <input type="hidden" name="geste" value="enregistrer" />
      {arrivage ? <input type="hidden" name="arrivage_id" value={arrivage.id} /> : null}

      <div className="ar-champs">
        <div className="champ">
          <label htmlFor={id("nom")}>Nom de l&apos;arrivage</label>
          <input id={id("nom")} name="nom" className="entree" required minLength={2} maxLength={60}
                 defaultValue={arrivage?.nom ?? ""} placeholder="Conteneur d'octobre" autoComplete="off" />
        </div>
        <div className="champ">
          <label htmlFor={id("date")}>Arrivée prévue</label>
          <input id={id("date")} name="date_prevue" type="date" className="entree" required
                 min={arrivage ? undefined : aujourdhui} defaultValue={arrivage?.date_prevue ?? ""} />
        </div>
        <div className="champ ar-champ-note">
          <label htmlFor={id("note")}>Note <span className="discret">(facultatif)</span></label>
          <input id={id("note")} name="note" className="entree" maxLength={300}
                 defaultValue={arrivage?.note ?? ""} placeholder="Fournisseur, n° de commande, port…" autoComplete="off" />
        </div>
      </div>

      <div className="rc-filtre ar-filtre">
        <span className="bo-recherche-champ">
          <Icone nom="recherche" />
          <input type="search" className="entree" value={filtre} onChange={(e) => setFiltre(e.target.value)}
                 placeholder="Filtrer : nom, marque ou référence" aria-label="Filtrer les produits" autoComplete="off" />
        </span>
        <label className="ar-epuisees">
          <input type="checkbox" checked={epuisees} onChange={(e) => setEpuisees(e.target.checked)} />
          Les épuisées seulement
        </label>
      </div>

      <div className="rc-produits">
        {produits.map((p) => (
          <section key={p.id} className="carte rc-produit" hidden={!visibles.includes(p)} aria-labelledby={id(`ar-${p.id}`)}>
            <div className="rc-produit-tete">
              <span className="rc-vignette" aria-hidden="true">
                {p.image ? <Image src={urlFichier(p.image)} alt="" fill sizes="44px" /> : <Icone nom="colis" taille={18} />}
              </span>
              <h3 id={id(`ar-${p.id}`)} className="rc-produit-nom">
                {p.nom}
                {p.marque ? <span className="discret"> · {p.marque}</span> : null}
              </h3>
              {!p.publie ? <span className="ui-etat">Brouillon</span> : null}
            </div>
            <ul className="rc-lignes">
              {p.variantes.map((v) => {
                const q = quantites[v.id] ?? "";
                const lisible = QUANTITE.test(q) && Number(q) > 0;
                const epuisee = v.stock <= 0;
                // « Les épuisées seulement » : une déclinaison en stock, sans quantité tapée, se cache aussi.
                return (
                  <li key={v.id} className="rc-ligne" hidden={epuisees && !epuisee && !q}
                      data-saisie={lisible ? "" : undefined} data-invalide={q && !QUANTITE.test(q) ? "" : undefined}>
                    <label htmlFor={id(`q-${v.id}`)} className="rc-quoi">
                      <b>{v.libelle || "Modèle unique"}</b>
                      <span className="discret tabular-nums">{v.sku}</span>
                    </label>
                    <span className={`rc-stock tabular-nums${epuisee ? " rc-stock-bas" : ""}`}>
                      {epuisee ? "Épuisée" : `${v.stock} en stock`}
                      {lisible && epuisee ? <span className="rc-apres"> · se précommande</span> : null}
                    </span>
                    <input
                      id={id(`q-${v.id}`)}
                      name={`q:${v.id}`}
                      className="entree rc-quantite tabular-nums"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder="0"
                      value={q}
                      onChange={(e) => setQuantites((avant) => ({ ...avant, [v.id]: e.target.value.replace(/\s/g, "") }))}
                      onKeyDown={suivante}
                      aria-label={`Quantité attendue : ${p.nom}${v.libelle ? `, ${v.libelle}` : ""}`}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {visibles.length === 0 ? (
          <p className="discret rc-rien">{cherche ? `Aucun produit ne correspond à « ${filtre} ».` : "Aucune déclinaison épuisée."}</p>
        ) : null}
      </div>

      <div className="rc-barre">
        <p className="rc-total" aria-live="polite">
          {saisies.length === 0 ? (
            "Tapez les quantités attendues."
          ) : (
            <>
              <b className="tabular-nums">{pieces}</b> pièce{pieces > 1 ? "s" : ""} sur <b className="tabular-nums">{saisies.length}</b> déclinaison{saisies.length > 1 ? "s" : ""}
              {aPrecommander ? <span className="discret"> · {aPrecommander} épuisée{aPrecommander > 1 ? "s" : ""}</span> : null}
            </>
          )}
          {invalides ? <span className="rc-invalide"> · {invalides} quantité{invalides > 1 ? "s" : ""} illisible{invalides > 1 ? "s" : ""}</span> : null}
        </p>
        <button type="submit" className="btn btn-primaire" disabled={saisies.length === 0 || invalides > 0}>
          <Icone nom="calendrier" taille={16} /> {arrivage ? "Enregistrer les changements" : "Annoncer l'arrivage"}
        </button>
      </div>
    </form>
  );
}
