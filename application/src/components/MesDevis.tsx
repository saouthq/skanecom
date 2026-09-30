"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Prix } from "./Prix";
import { supabaseNavigateur } from "@/lib/supabase-navigateur";
import { urlFichier } from "@/lib/photos";
import { t } from "@/lib/i18n";

/* ============================================================================
   MES DEVIS (module devis) — dans « Mes commandes » : chaque demande et où
   elle en est (en cours de chiffrage, prête, acceptée, retirée, annulée,
   expirée). Prête, elle montre ses prix, les frais, le total, sa validité
   et le mot de la boutique : « Accepter et commander » ouvre le tunnel à ses
   prix (/commande?devis=…), « Refuser » la clôt (un motif, facultatif).
   Lu dans le navigateur avec la session de l'acheteur (public.mes_devis).
   ========================================================================== */

type LigneDevis = {
  variante_id: string;
  produit_nom: string;
  variante_libelle: string | null;
  sku: string | null;
  quantite: number;
  prix_millimes: number | null;
  prix_catalogue_millimes: number;
  image: string | null;
};

type Devis = {
  numero: string;
  statut: "demande" | "envoye" | "accepte" | "refuse" | "annule" | "expire";
  cree_le: string;
  envoye_le: string | null;
  valide_jusqu_au: string | null;
  message: string | null;
  motif: string | null;
  note: string | null;
  frais_livraison_millimes: number | null;
  total_millimes: number | null;
  commande: string | null;
  lignes: LigneDevis[];
};

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Tunis" });
const jour = (iso: string) => JOUR.format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso));

export function MesDevis({ boutiqueId }: { boutiqueId: string }) {
  const [devis, setDevis] = useState<Devis[]>([]);
  const [relecture, setRelecture] = useState(0);

  useEffect(() => {
    let actif = true;
    supabaseNavigateur()
      .rpc("mes_devis", { p_boutique_id: boutiqueId })
      .then(({ data, error }) => {
        if (actif && !error) setDevis((data as Devis[] | null) ?? []);
      });
    return () => {
      actif = false;
    };
  }, [boutiqueId, relecture]);

  if (devis.length === 0) return null;
  return (
    <section className="devis-mes" aria-labelledby="devis-mes-titre">
      <h2 id="devis-mes-titre">{t.devis.mesDevis}</h2>
      <ul role="list">
        {devis.map((d) => (
          <CarteDevis key={d.numero} d={d} boutiqueId={boutiqueId} relire={() => setRelecture((n) => n + 1)} />
        ))}
      </ul>
    </section>
  );
}

function CarteDevis({ d, boutiqueId, relire }: { d: Devis; boutiqueId: string; relire: () => void }) {
  const [refus, setRefus] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [motif, setMotif] = useState("");
  const chiffre = d.statut !== "demande";
  const ouvert = d.statut === "demande" || d.statut === "envoye";
  const total = d.total_millimes !== null ? d.total_millimes + (d.frais_livraison_millimes ?? 0) : null;

  async function refuser() {
    setEnvoi(true);
    setErreur(null);
    const { error } = await supabaseNavigateur().rpc("refuser_devis", { p_boutique_id: boutiqueId, p_numero: d.numero, p_motif: motif.trim() || null });
    setEnvoi(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setRefus(false);
    relire();
  }

  return (
    <li className="devis-carte" data-statut={d.statut}>
      <div className="devis-carte-tete">
        <span className="devis-carte-qui">
          <b>{d.numero}</b>
          <span className="legende">{t.devis.demandeLe(jour(d.cree_le))}</span>
        </span>
        <span className="devis-statut">{t.devis.statut[d.statut] ?? d.statut}</span>
      </div>

      <ul className="devis-lignes" role="list">
        {d.lignes.map((l) => (
          <li key={l.variante_id} className="devis-ligne">
            <span className="devis-vignette" aria-hidden="true">
              {l.image ? <Image src={urlFichier(l.image)} alt="" fill sizes="56px" /> : <span className="panier-vignette-attente">{l.produit_nom.trim().charAt(0)}</span>}
            </span>
            <span className="devis-ligne-corps">
              <span className="devis-ligne-nom">{l.produit_nom}{l.variante_libelle ? ` · ${l.variante_libelle}` : ""}</span>
              <span className="legende tabular-nums">{l.sku} · {t.commande.quantite(l.quantite)}</span>
            </span>
            <span className="devis-ligne-prix">
              {chiffre && l.prix_millimes !== null ? (
                <>
                  <Prix millimes={l.prix_millimes * l.quantite} />
                  {l.prix_millimes < l.prix_catalogue_millimes ? <s className="devis-ligne-catalogue"><Prix millimes={l.prix_catalogue_millimes * l.quantite} /></s> : null}
                </>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      {chiffre && total !== null ? (
        <dl className="devis-totaux">
          <div>
            <dt>{t.devis.livraison}</dt>
            <dd>
              {d.frais_livraison_millimes === null ? <span className="legende">{t.devis.livraisonSelon}</span>
                : d.frais_livraison_millimes === 0 ? t.devis.livraisonOfferte
                : <Prix millimes={d.frais_livraison_millimes} />}
            </dd>
          </div>
          <div className="devis-total">
            <dt>{t.devis.total}</dt>
            <dd><Prix millimes={total} fort /></dd>
          </div>
        </dl>
      ) : null}

      {chiffre && d.note ? (
        <blockquote className="devis-note">
          <span className="legende">{t.devis.noteBoutique}</span>
          <p>{d.note}</p>
        </blockquote>
      ) : null}
      {d.motif && (d.statut === "annule" || d.statut === "refuse") ? <p className="legende devis-motif">{d.motif}</p> : null}

      <div className="devis-carte-pied">
        {d.statut === "envoye" && d.valide_jusqu_au ? <span className="legende">{t.devis.valableJusquau(jour(d.valide_jusqu_au))}</span> : null}
        {d.statut === "expire" && d.valide_jusqu_au ? <span className="legende">{t.devis.expireLe(jour(d.valide_jusqu_au))}</span> : null}
        {d.statut === "accepte" && d.commande ? <span className="legende">{t.devis.commande(d.commande)}</span> : null}
        {ouvert && !refus ? (
          <span className="devis-gestes">
            {d.statut === "envoye" ? (
              <a className="btn btn-primaire" href={`/commande?devis=${encodeURIComponent(d.numero)}`}>{t.devis.accepter}</a>
            ) : null}
            <button type="button" className="btn-lien legende" onClick={() => setRefus(true)}>
              {d.statut === "envoye" ? t.devis.refuser : t.devis.retirer}
            </button>
          </span>
        ) : null}
      </div>

      {refus ? (
        <div className="devis-refus">
          <label htmlFor={`refus-${d.numero}`}>{t.devis.motifRefus}</label>
          <div className="tunnel-rangee">
            <input id={`refus-${d.numero}`} value={motif} maxLength={300} onChange={(e) => setMotif(e.target.value)} />
            <button type="button" className="btn btn-second" onClick={() => void refuser()} disabled={envoi}>{t.devis.confirmerRefus}</button>
          </div>
          <button type="button" className="btn-lien legende" onClick={() => setRefus(false)}>{t.devis.annuler}</button>
          {erreur ? <p className="champ-erreur" role="alert">{erreur}</p> : null}
        </div>
      ) : null}
    </li>
  );
}
