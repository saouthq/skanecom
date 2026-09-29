"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { unzip } from "fflate";
import { Icone } from "@/components/console/Icone";
import { nomPour, reduire } from "@/components/console/DepotPhotos";
import { aIgnorer, rapprocher, type ProduitReference } from "@/lib/console/photos-import";

/* ============================================================================
   LES PHOTOS À L'IMPORT (C5) — déposer un dossier de photos (ou un .zip) ;
   le navigateur rapproche chaque fichier d'un produit (lib/console/
   photos-import.ts), montre le rapport, puis réduit et envoie les photos
   une à une, dans un même lot. Rien ne part avant « Envoyer ».
   ========================================================================== */

type Lu = { chemin: string; blob: Blob; url: string };

type Etat =
  | { phase: "choix" }
  | { phase: "lecture" }
  | { phase: "rapport" }
  | { phase: "envoi"; fait: number; total: number }
  | { phase: "fini"; ajoutees: number; produits: number; erreurs: string[] };

const ZIP_MAX = 400 * 1024 * 1024;
const TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

const nomSimple = (chemin: string) => chemin.split("/").pop() ?? chemin;
const pluriel = (n: number, un: string, plusieurs: string) => `${n.toLocaleString("fr-FR")} ${n > 1 ? plusieurs : un}`;

function dezipper(octets: Uint8Array): Promise<Record<string, Uint8Array>> {
  return new Promise((ok, ko) => unzip(octets, { filter: (e) => !aIgnorer(e.name) }, (erreur, contenu) => (erreur ? ko(erreur) : ok(contenu))));
}

export function ImportPhotos({ slug, produits }: { slug: string; produits: ProduitReference[] }) {
  const router = useRouter();
  const [fichiers, setFichiers] = useState<Lu[]>([]);
  const [completer, setCompleter] = useState(false);
  const [etat, setEtat] = useState<Etat>({ phase: "choix" });
  const [note, setNote] = useState<string | null>(null);
  const [survol, setSurvol] = useState(false);
  const entree = useRef<HTMLInputElement>(null);
  const entreeDossier = useRef<HTMLInputElement>(null);
  // Les aperçus (adresses locales des fichiers), libérés à la remise à zéro
  // et quand on quitte la page.
  const apercus = useRef<string[]>([]);
  useEffect(() => {
    const liste = apercus.current;
    return () => liste.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  const apercu = (blob: Blob) => {
    const u = URL.createObjectURL(blob);
    apercus.current.push(u);
    return u;
  };

  const rapport = useMemo(
    () => rapprocher(fichiers.map((f) => ({ chemin: f.chemin, taille: f.blob.size })), produits, completer),
    [fichiers, produits, completer],
  );
  const aEnvoyer = rapport.groupes.reduce((n, g) => n + g.envoyer.length, 0);
  const produitsServis = rapport.groupes.filter((g) => g.envoyer.length > 0).length;
  const gardes = rapport.groupes.filter((g) => g.gardees.length > 0);
  const enTrop = rapport.groupes.reduce((n, g) => n + g.enTrop.length, 0);
  const restentSansPhoto = produits.filter((p) => p.photos === 0 && !rapport.groupes.some((g) => g.produit.id === p.id && g.envoyer.length > 0));

  async function lire(liste: File[]) {
    if (liste.length === 0) return;
    setEtat({ phase: "lecture" });
    setNote(null);
    const lus: Lu[] = [];
    const notes: string[] = [];
    for (const f of liste) {
      if (/\.zip$/i.test(f.name) || f.type === "application/zip" || f.type === "application/x-zip-compressed") {
        if (f.size > ZIP_MAX) {
          notes.push(`« ${f.name} » dépasse 400 Mo : envoyez-le en plusieurs .zip.`);
          continue;
        }
        try {
          const contenu = await dezipper(new Uint8Array(await f.arrayBuffer()));
          for (const [chemin, octets] of Object.entries(contenu)) {
            const type = TYPES[chemin.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
            const blob = new Blob([octets as BlobPart], { type });
            lus.push({ chemin, blob, url: apercu(blob) });
          }
        } catch {
          notes.push(`« ${f.name} » n'est pas un .zip lisible.`);
        }
      } else {
        const chemin = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
        lus.push({ chemin, blob: f, url: apercu(f) });
      }
    }
    setFichiers((avant) => [...avant, ...lus]);
    setNote(notes.length ? notes.join(" ") : null);
    setEtat({ phase: "rapport" });
    if (entree.current) entree.current.value = "";
    if (entreeDossier.current) entreeDossier.current.value = "";
  }

  function recommencer() {
    apercus.current.splice(0).forEach((u) => URL.revokeObjectURL(u));
    setFichiers([]);
    setNote(null);
    setEtat({ phase: "choix" });
  }

  async function envoyer() {
    const liste = rapport.groupes.flatMap((g) => g.envoyer.map((e) => ({ g, e })));
    if (liste.length === 0) return;
    const lot = crypto.randomUUID();
    let ajoutees = 0;
    const servis = new Set<string>();
    const erreurs: string[] = [];
    for (let i = 0; i < liste.length; i += 1) {
      setEtat({ phase: "envoi", fait: i, total: liste.length });
      const { g, e } = liste[i];
      const lu = fichiers[e.index];
      const fichier = lu.blob instanceof File ? lu.blob : new File([lu.blob], nomSimple(lu.chemin), { type: lu.blob.type });
      const reduit = await reduire(fichier);
      const donnees = new FormData();
      donnees.set("lot", lot);
      donnees.set("produit_id", g.produit.id);
      if (e.varianteId) donnees.set("variante_id", e.varianteId);
      donnees.set("alt", e.libelle ? `${g.produit.nom} — ${e.libelle}` : g.produit.nom);
      donnees.set("photo", reduit, nomPour(fichier, reduit));
      try {
        const r = await fetch(`/boutiques/${slug}/import/photos/envoyer`, { method: "POST", body: donnees, headers: { accept: "application/json" } });
        const reponse = r.redirected ? null : ((await r.json().catch(() => null)) as { ok: boolean; message?: string } | null);
        if (!reponse) {
          erreurs.push("La session a pris fin : reconnectez-vous, puis renvoyez les photos qui manquent.");
          break;
        }
        if (!reponse.ok) {
          erreurs.push(`${nomSimple(lu.chemin)} : ${reponse.message ?? "refusée"}`);
          continue;
        }
        ajoutees += 1;
        servis.add(g.produit.id);
      } catch {
        erreurs.push(`${nomSimple(lu.chemin)} : l'envoi n'a pas abouti (réseau coupé ?). Renvoyez le dossier : les produits servis ne recevront rien de plus.`);
        break;
      }
    }
    setEtat({ phase: "fini", ajoutees, produits: servis.size, erreurs });
    router.refresh();
  }

  if (etat.phase === "fini") {
    return (
      <section className="carte pi-fin" aria-labelledby="t-pi-fin" aria-live="polite">
        <div className="carte-tete">
          <div>
            <h2 id="t-pi-fin" className="carte-titre-icone">
              <Icone nom={etat.ajoutees ? "succes" : "alerte"} /> {etat.ajoutees ? `${pluriel(etat.ajoutees, "photo ajoutée", "photos ajoutées")} à ${pluriel(etat.produits, "produit", "produits")}` : "Aucune photo ajoutée"}
            </h2>
            <p>La vitrine les montre dans les cinq minutes (le temps de son cache). En cas d&apos;erreur de rapprochement, « Retirer ces photos » ci-dessous annule l&apos;envoi entier.</p>
          </div>
        </div>
        {etat.erreurs.length ? (
          <ul className="pi-erreurs" role="list">
            {etat.erreurs.map((e) => <li key={e}>{e}</li>)}
          </ul>
        ) : null}
        <div className="carte-pied">
          <button type="button" className="btn btn-second" onClick={recommencer}>Déposer d&apos;autres photos</button>
        </div>
      </section>
    );
  }

  const occupe = etat.phase === "lecture" || etat.phase === "envoi";

  return (
    <section className="carte pi-import" aria-labelledby="t-pi-import">
      <div className="carte-tete">
        <div>
          <h2 id="t-pi-import" className="carte-titre-icone"><Icone nom="photo" /> Déposer les photos</h2>
          <p>
            Nommées d&apos;après la référence — <code>PP18-KIT.jpg</code>, <code>PP18-KIT-2.jpg</code> — ou le nom du produit, ou rangées
            dans un dossier par référence. Photos JPEG, PNG ou WebP, ou un .zip.
          </p>
        </div>
      </div>

      <label className="pi-zone" data-survol={survol ? "" : undefined} data-occupe={occupe ? "" : undefined}
        onDragEnter={() => setSurvol(true)} onDragLeave={() => setSurvol(false)} onDrop={() => setSurvol(false)}>
        <input ref={entree} type="file" multiple accept="image/jpeg,image/png,image/webp,.zip,application/zip" className="pi-entree"
          disabled={occupe} aria-describedby="pi-aide" onChange={(e) => void lire(Array.from(e.currentTarget.files ?? []))} />
        <span className="pi-zone-icone" aria-hidden="true"><Icone nom={occupe ? "horloge" : "importer"} taille={20} /></span>
        <strong className="pi-zone-libelle" aria-live="polite">
          {etat.phase === "lecture" ? "Lecture des fichiers…"
            : etat.phase === "envoi" ? `Envoi ${etat.fait + 1} sur ${etat.total}…`
            : fichiers.length ? "Ajouter d'autres photos" : "Glissez les photos ou le .zip ici"}
        </strong>
        <span id="pi-aide" className="pi-zone-aide">ou touchez pour les choisir. Rien ne part avant « Envoyer ».</span>
        {etat.phase === "envoi" ? (
          <span className="pi-barre" aria-hidden="true"><span style={{ inlineSize: `${Math.max(3, (etat.fait / etat.total) * 100)}%` }} /></span>
        ) : null}
      </label>
      <div className="pi-choix-dossier">
        <input ref={entreeDossier} id="pi-dossier" type="file" multiple className="sr-only" disabled={occupe}
          {...{ webkitdirectory: "" }} onChange={(e) => void lire(Array.from(e.currentTarget.files ?? []))} />
        <label htmlFor="pi-dossier" className="btn-lien">Choisir un dossier entier</label>
      </div>
      {note ? <p className="message message-erreur" role="alert">{note}</p> : null}

      {fichiers.length > 0 && etat.phase !== "lecture" ? (
        <div className="pi-rapport">
          <div className="pi-bilan">
            <p className="pi-bilan-texte">
              <b>{pluriel(aEnvoyer, "photo", "photos")}</b> pour <b>{pluriel(produitsServis, "produit", "produits")}</b>
              {rapport.sansProduit.length ? <> · <span className="pi-alerte">{pluriel(rapport.sansProduit.length, "fichier", "fichiers")} sans produit</span></> : null}
              {gardes.length ? <> · {pluriel(gardes.length, "produit a", "produits ont")} déjà des photos</> : null}
              {enTrop ? <> · {pluriel(enTrop, "photo", "photos")} au-delà de douze</> : null}
            </p>
            <div className="pi-bilan-gestes">
              <button type="button" className="btn btn-second" onClick={recommencer} disabled={occupe}>Tout retirer</button>
              <button type="button" className="btn btn-primaire" onClick={() => void envoyer()} disabled={occupe || aEnvoyer === 0}>
                {aEnvoyer ? `Envoyer ${pluriel(aEnvoyer, "photo", "photos")}` : "Rien à envoyer"}
              </button>
            </div>
          </div>
          <label className="opt pi-completer">
            <input type="checkbox" checked={completer} onChange={(e) => setCompleter(e.currentTarget.checked)} disabled={occupe} />
            <span>
              Compléter aussi les produits qui ont déjà des photos
              <span className="aide"> — sinon, seuls les produits sans photo en reçoivent : renvoyer le même dossier ne double rien.</span>
            </span>
          </label>

          <ul className="pi-groupes" role="list">
            {rapport.groupes.map((g) => {
              const indices = g.envoyer.length ? g.envoyer.map((e) => e.index) : g.gardees;
              const libelles = [...new Set(g.envoyer.map((e) => e.libelle).filter(Boolean))];
              return (
                <li key={g.produit.id} className="pi-groupe" data-garde={g.envoyer.length ? undefined : ""}>
                  <span className="pi-vignettes" aria-hidden="true">
                    {indices.slice(0, 4).map((i) => (
                      // eslint-disable-next-line @next/next/no-img-element -- aperçu local (adresse blob:), pas une image du site
                      <img key={i} src={fichiers[i].url} alt="" />
                    ))}
                  </span>
                  <span className="pi-groupe-texte">
                    <span className="pi-groupe-nom">{g.produit.nom}</span>
                    <span className="pi-groupe-detail">
                      {g.envoyer.length
                        ? `${pluriel(g.envoyer.length, "photo", "photos")}${g.produit.photos ? ` après ses ${g.produit.photos}` : ""}${libelles.length ? ` · ${libelles.join(", ")}` : ""}`
                        : `déjà ${pluriel(g.produit.photos, "photo", "photos")} : laissé tel quel`}
                      {g.enTrop.length ? ` · ${g.enTrop.length} au-delà de douze, laissée(s) de côté` : ""}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>

          {rapport.sansProduit.length ? (
            <details className="pi-details" open={rapport.groupes.length === 0}>
              <summary>{pluriel(rapport.sansProduit.length, "fichier", "fichiers")} sans produit</summary>
              <p className="aide">Renommez-les d&apos;après une référence du catalogue (ou le nom du produit), puis déposez-les de nouveau.</p>
              <ul role="list">{rapport.sansProduit.map((i) => <li key={i}><code>{fichiers[i].chemin}</code></li>)}</ul>
            </details>
          ) : null}
          {restentSansPhoto.length ? (
            <details className="pi-details">
              <summary>{pluriel(restentSansPhoto.length, "produit restera", "produits resteront")} sans photo</summary>
              <ul role="list">{restentSansPhoto.slice(0, 50).map((p) => <li key={p.id}>{p.nom} <span className="discret">· {p.variantes.map((v) => v.sku).join(", ")}</span></li>)}</ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
