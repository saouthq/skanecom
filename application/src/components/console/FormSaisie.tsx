"use client";

import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { Icone } from "./Icone";
import { urlFichier } from "@/lib/photos";
import { formatePrix } from "@/lib/prix";
import { millimes } from "@/lib/console/import";
import { telephoneLisible } from "@/lib/commande";
import {
  CANAUX,
  messageSaisie,
  type Chiffrage,
  type ClientSaisi,
  type DeclinaisonSaisie,
  type ProduitSaisie,
  type Saisie,
} from "@/lib/gestion/saisie";

/* ============================================================================
   LA SAISIE D'UNE COMMANDE — l'écran se remplit dans l'ordre d'un appel :
   d'où vient la commande, le numéro du client (le client connu se retrouve :
   son nom, son historique, son compte pro, l'adresse de sa dernière
   livraison), les articles cherchés au clavier dans le catalogue (↓ ↑,
   Entrée ajoute, la recherche se vide pour l'article suivant), la livraison
   ou le retrait, la remise et la livraison offerte (la direction), et s'il
   a confirmé. À chaque changement, la base rechiffre (…/chiffrer) : le
   récapitulatif dit ce que le client paiera, et ce qui manque encore.

   Un formulaire HTML : il part par l'envoi en place du backoffice
   (Retours.tsx) ; refusé, tout reste à l'écran, le message en tête.
   Seul le bouton l'envoie : Entrée dans un champ ne fait rien partir.
   ========================================================================== */

type Ligne = { variante_id: string; quantite: number };
type Trouvee = { produit: ProduitSaisie; declinaison: DeclinaisonSaisie };

const chiffres = (t: string) => t.replace(/\D/g, "");
/** 8 chiffres, ou 216 suivi de 8 : un numéro tunisien qu'on peut chercher. */
const numeroComplet = (t: string) => {
  const c = chiffres(t);
  return c.length === 8 || (c.length === 11 && c.startsWith("216"));
};
const normalise = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function FormSaisie({
  base,
  saisie,
  gouvernorats,
  telephoneInitial,
  cle: cleInitiale,
}: {
  base: string;
  saisie: Saisie;
  gouvernorats: { code: string; nom: string }[];
  telephoneInitial: string;
  cle: string;
}) {
  const id = useId();
  // La clé de la première page : un rendu après un refus n'en change pas.
  const [cle] = useState(cleInitiale);
  const [canal, setCanal] = useState("");
  const [telephone, setTelephone] = useState(telephoneInitial);
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  // La dernière réponse de la base, pour quel numéro ; pour quelle saisie.
  const [trouve, setTrouve] = useState<{ tel: string; client: ClientSaisi | null } | null>(null);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [recherche, setRecherche] = useState("");
  const [active, setActive] = useState(0);
  const [mode, setMode] = useState<"domicile" | "retrait" | "comptoir">("domicile");
  const [adresse, setAdresse] = useState({ ligne1: "", ligne2: "", ville: "", gouvernorat: "", code_postal: "" });
  const [remise, setRemise] = useState("");
  const [offerte, setOfferte] = useState(false);
  const [confirmee, setConfirmee] = useState(true);
  const [note, setNote] = useState("");
  const [reponse, setReponse] = useState<{ requete: string; chiffrage: Chiffrage | null; erreur: { texte: string; indice?: string } | null } | null>(null);

  // Toutes les déclinaisons, par identifiant.
  const index = useMemo(() => {
    const m = new Map<string, Trouvee>();
    for (const p of saisie.produits) for (const d of p.variantes) m.set(d.id, { produit: p, declinaison: d });
    return m;
  }, [saisie.produits]);

  // Le client d'un numéro complet : son nom, son e-mail s'ils ne sont pas tapés.
  const tel = chiffres(telephone);
  const complet = numeroComplet(telephone);
  useEffect(() => {
    if (!complet) return;
    const arret = new AbortController();
    fetch(`${base}/client?tel=${encodeURIComponent(tel)}`, { signal: arret.signal, cache: "no-store" })
      .then((r) => r.json() as Promise<{ client: ClientSaisi | null }>)
      .then(({ client: c }) => {
        setTrouve({ tel, client: c });
        if (c?.connu) {
          if (c.nom) setNom((n) => n || c.nom || "");
          if (c.email) setEmail((e) => e || c.email || "");
        }
      })
      .catch(() => {});
    return () => arret.abort();
  }, [tel, complet, base]);
  const client = complet && trouve?.tel === tel ? trouve.client : null;

  // Le chiffrage par la base, un quart de seconde après le dernier changement.
  // La requête est sa propre clé : une réponse ne vaut que pour la saisie qui l'a demandée.
  const remiseMillimes = millimes(remise);
  const remiseIllisible = Number.isNaN(remiseMillimes);
  const requete = lignes.length === 0 || remiseIllisible ? null : JSON.stringify({
    telephone: complet ? tel : "",
    lignes,
    livraison: { mode, gouvernorat: mode === "domicile" ? adresse.gouvernorat || null : null },
    ajustements: { remise_millimes: remiseMillimes === null ? null : String(remiseMillimes), livraison_offerte: offerte && mode === "domicile" },
  });
  useEffect(() => {
    if (requete === null) return;
    const arret = new AbortController();
    const minuterie = window.setTimeout(() => {
      fetch(`${base}/chiffrer`, { method: "POST", signal: arret.signal, headers: { "content-type": "application/json" }, body: requete })
        .then((r) => r.json() as Promise<{ chiffrage: Chiffrage | null; erreur?: string; indice?: string }>)
        .then((r) => setReponse({ requete, chiffrage: r.chiffrage, erreur: r.erreur ? { texte: r.erreur, indice: r.indice } : null }))
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name === "AbortError") return;
          setReponse({ requete, chiffrage: null, erreur: { texte: "Le total n'a pas pu être calculé : vérifiez la connexion." } });
        });
    }, 250);
    return () => {
      arret.abort();
      window.clearTimeout(minuterie);
    };
  }, [requete, base]);
  const aJour = requete !== null && reponse?.requete === requete;
  const calcul = requete !== null && !aJour;
  // Pendant un nouveau calcul, le dernier chiffrage reste affiché (le bouton attend).
  const chiffrage = requete === null ? null : (reponse?.chiffrage ?? null);
  const erreurChiffrage = aJour ? reponse.erreur : null;

  // La recherche d'articles : nom, marque, référence, déclinaison.
  const mots = normalise(recherche.trim()).split(/\s+/).filter(Boolean);
  const resultats = useMemo(() => {
    if (mots.length === 0) return [] as Trouvee[];
    const r: Trouvee[] = [];
    for (const p of saisie.produits) {
      for (const d of p.variantes) {
        const texte = normalise(`${p.nom} ${p.marque ?? ""} ${d.sku} ${d.libelle ?? ""}`);
        if (mots.every((m) => texte.includes(m))) r.push({ produit: p, declinaison: d });
        if (r.length >= 8) return r;
      }
    }
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche, saisie.produits]);
  const ouverte = mots.length > 0;

  const ajoute = (t: Trouvee) => {
    if (t.declinaison.stock <= 0) return;
    setLignes((avant) => {
      const deja = avant.find((l) => l.variante_id === t.declinaison.id);
      if (deja) return avant.map((l) => (l === deja ? { ...l, quantite: Math.min(999, l.quantite + 1) } : l));
      return [...avant, { variante_id: t.declinaison.id, quantite: Math.max(1, t.declinaison.quantite_min) }];
    });
    setRecherche("");
    setActive(0);
    document.getElementById(`${id}-recherche`)?.focus();
  };
  const quantite = (varianteId: string, q: number) =>
    setLignes((avant) => avant.map((l) => (l.variante_id === varianteId ? { ...l, quantite: Math.min(999, Math.max(1, q)) } : l)));
  const retire = (varianteId: string) => {
    setLignes((avant) => avant.filter((l) => l.variante_id !== varianteId));
    document.getElementById(`${id}-recherche`)?.focus();
  };

  const clavierRecherche = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && resultats.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % resultats.length);
    } else if (e.key === "ArrowUp" && resultats.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + resultats.length) % resultats.length);
    } else if (e.key === "Enter") {
      // Entrée ajoute l'article choisi ; elle n'envoie jamais la commande.
      e.preventDefault();
      if (resultats[active]) ajoute(resultats[active]);
    } else if (e.key === "Escape" && recherche) {
      e.preventDefault();
      setRecherche("");
    }
  };

  // « Au magasin » : le client est là, la vente se fait d'ordinaire sur place
  // (sauf si une adresse est déjà tapée) ; hors du magasin, pas de comptoir.
  const choisitCanal = (cle: string) => {
    setCanal(cle);
    if (cle === "magasin" && mode === "domicile" && !adresse.ligne1.trim()) setMode("comptoir");
    if (cle !== "magasin" && mode === "comptoir") setMode("domicile");
  };

  const reprendAdresse = () => {
    const a = client?.adresse;
    if (!a) return;
    setMode("domicile");
    setAdresse({ ligne1: a.ligne1 ?? "", ligne2: a.ligne2 ?? "", ville: a.ville ?? "", gouvernorat: a.gouvernorat ?? "", code_postal: a.code_postal ?? "" });
  };

  // Ce qui manque avant d'enregistrer, dans l'ordre de l'écran.
  const lignesChiffrees = new Map((chiffrage?.lignes ?? []).map((l) => [l.variante_id, l]));
  const manque: string[] = [];
  if (!canal) manque.push("d'où vient la commande");
  if (!numeroComplet(telephone)) manque.push("le numéro du client");
  if (nom.trim().length < 2) manque.push("son nom");
  if (lignes.length === 0) manque.push("un article au moins");
  if (mode === "domicile") {
    if (adresse.ligne1.trim().length < 3) manque.push("l'adresse");
    if (adresse.ville.trim().length < 2) manque.push("la ville");
    if (!adresse.gouvernorat) manque.push("le gouvernorat");
  }
  const enStock = chiffrage ? chiffrage.complet : true;
  const pret = manque.length === 0 && !calcul && !erreurChiffrage && !remiseIllisible && chiffrage !== null
    && chiffrage.total_millimes !== null && enStock;
  const pieces = lignes.reduce((s, l) => s + l.quantite, 0);
  const total = chiffrage?.total_millimes ?? null;
  const risque = client?.connu ? client.niveau_risque : undefined;
  const comptoir = mode === "comptoir";
  const nomGouvernorat = gouvernorats.find((g) => g.code === adresse.gouvernorat)?.nom;

  // Dans la barre du téléphone, le total est déjà à côté : le bouton dit seulement le geste.
  const bouton = (classe: string, avecTotal: boolean) => (
    <button type="submit" className={`btn btn-primaire btn-grand ${classe}`} disabled={!pret}>
      <Icone nom="coche" taille={16} />
      {!avecTotal ? "Enregistrer" : pret && total !== null ? `${comptoir ? "Encaisser" : "Enregistrer"} · ${formatePrix(total)}` : comptoir ? "Enregistrer la vente" : "Enregistrer la commande"}
    </button>
  );

  return (
    <form
      method="post"
      action={`${base}/action`}
      className="sc-form grille-2"
      // Entrée dans un champ n'envoie jamais la commande, en plein appel : seul le bouton l'enregistre.
      onKeyDown={(e) => { if (e.key === "Enter" && e.target instanceof HTMLInputElement) e.preventDefault(); }}
    >
      <input type="hidden" name="cle" value={cle} />
      <input type="hidden" name="total" value={total ?? ""} />
      <input type="hidden" name="mode" value={mode} />

      <div className="pile sc-etapes">
        {/* 1 · D'où vient la commande */}
        <fieldset className="carte sc-carte">
          <legend className="sc-titre"><span className="sc-num" aria-hidden="true">1</span> D&apos;où vient la commande</legend>
          <div className="sc-canaux" role="radiogroup" aria-label="Canal de la commande">
            {CANAUX.map((c) => (
              <label key={c.cle} className="sc-canal">
                <input type="radio" name="canal" value={c.cle} checked={canal === c.cle} onChange={() => choisitCanal(c.cle)} required />
                <Icone nom={c.icone} taille={15} /> {c.libelle}
              </label>
            ))}
          </div>
        </fieldset>

        {/* 2 · Le client */}
        <fieldset className="carte sc-carte">
          <legend className="sc-titre"><span className="sc-num" aria-hidden="true">2</span> Le client</legend>
          <div className="sc-grille">
            <div className="champ">
              <label htmlFor={`${id}-tel`}>Numéro du client</label>
              <input id={`${id}-tel`} name="telephone" type="tel" inputMode="tel" autoComplete="off" required
                     placeholder="20 123 456" value={telephone} onChange={(e) => setTelephone(e.target.value)} />
            </div>
            <div className="champ">
              <label htmlFor={`${id}-nom`}>Nom</label>
              <input id={`${id}-nom`} name="nom" autoComplete="off" required maxLength={80}
                     placeholder="Prénom et nom" value={nom} onChange={(e) => setNom(e.target.value)} />
            </div>
            <div className="champ sc-large">
              <label htmlFor={`${id}-email`}>E-mail <span className="facultatif">(facultatif)</span></label>
              <input id={`${id}-email`} name="email" type="email" autoComplete="off" maxLength={254}
                     value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          {client ? (
            <div className={`sc-client${risque === "bloque" || risque === "surveille" ? " sc-client-risque" : ""}`} role="status">
              {client.connu ? (
                <>
                  <p className="sc-client-tete">
                    <Icone nom="personne" taille={15} />
                    <b>{client.nom ?? telephoneLisible(client.telephone)}</b>
                    <span className="discret">
                      {" "}· client {client.compte ? "avec un compte" : "connu"} · {client.nb_commandes ?? 0} commande{(client.nb_commandes ?? 0) > 1 ? "s" : ""}
                    </span>
                    {(client.nb_refus ?? 0) > 0 ? <span className="ui-etat ui-etat-rouge">{client.nb_refus} refus</span> : null}
                    {client.pro ? <span className="ui-etat ui-etat-bleu">Pro · {client.pro}</span> : null}
                  </p>
                  {risque === "bloque" ? (
                    <p className="sc-client-texte">Bloqué pour la vitrine : il ne peut plus commander en ligne. Vous pouvez saisir sa commande si vous lui faites confiance.</p>
                  ) : risque === "surveille" ? (
                    <p className="sc-client-texte">Client surveillé : confirmez bien sa commande avec lui.</p>
                  ) : null}
                  {client.pro ? <p className="sc-client-texte">Ses prix pro s&apos;appliquent.</p> : null}
                  {client.adresse ? (
                    <button type="button" className="btn btn-second btn-petit sc-reprendre" onClick={reprendAdresse}>
                      <Icone nom="lieu" taille={14} /> Livrer à sa dernière adresse : {client.adresse.ligne1}, {client.adresse.ville}
                    </button>
                  ) : null}
                </>
              ) : (
                <p className="sc-client-nouveau"><Icone nom="plus" taille={15} /> <span>Nouveau client : sa fiche sera créée avec la commande.</span></p>
              )}
            </div>
          ) : null}
        </fieldset>

        {/* 3 · Les articles */}
        <fieldset className="carte sc-carte">
          <legend className="sc-titre"><span className="sc-num" aria-hidden="true">3</span> Les articles</legend>
          <div className="sc-recherche">
            <span className="bo-recherche-champ">
              <Icone nom="recherche" />
              <input
                id={`${id}-recherche`}
                type="search"
                className="entree"
                role="combobox"
                aria-expanded={ouverte}
                aria-controls={`${id}-resultats`}
                aria-autocomplete="list"
                aria-activedescendant={ouverte && resultats[active] ? `${id}-r-${resultats[active].declinaison.id}` : undefined}
                aria-label="Chercher un article"
                placeholder="Nom, marque ou référence"
                autoComplete="off"
                value={recherche}
                onChange={(e) => { setRecherche(e.target.value); setActive(0); }}
                onKeyDown={clavierRecherche}
              />
            </span>
            {ouverte ? (
              <ul id={`${id}-resultats`} role="listbox" className="sc-resultats" aria-label="Articles trouvés">
                {resultats.length === 0 ? (
                  <li className="sc-rien" role="presentation">Aucun article ne correspond à « {recherche.trim()} ».</li>
                ) : resultats.map((t, i) => {
                  const epuise = t.declinaison.stock <= 0;
                  return (
                    <li
                      key={t.declinaison.id}
                      id={`${id}-r-${t.declinaison.id}`}
                      role="option"
                      aria-selected={i === active}
                      aria-disabled={epuise || undefined}
                      className="sc-resultat"
                      data-active={i === active ? "" : undefined}
                      onMouseEnter={() => setActive(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => ajoute(t)}
                    >
                      <Vignette image={t.declinaison.image ?? t.produit.image} />
                      <span className="sc-quoi">
                        <b>{t.produit.nom}</b>
                        <span className="discret">{t.declinaison.libelle ? `${t.declinaison.libelle} · ` : ""}<span className="sc-sku">{t.declinaison.sku}</span></span>
                      </span>
                      <span className={`sc-stock${epuise ? " sc-stock-epuise" : t.declinaison.stock <= 2 ? " sc-stock-bas" : ""}`}>
                        {epuise ? "Épuisé" : `${t.declinaison.stock} en stock`}
                      </span>
                      <span className="sc-prix tabular-nums">{formatePrix(t.declinaison.prix_millimes)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          {lignes.length === 0 ? (
            <p className="sc-vide discret">Cherchez un article : ↓ ↑ pour choisir, Entrée pour l&apos;ajouter.</p>
          ) : (
            <ul className="sc-lignes" aria-label="Articles de la commande">
              {lignes.map((l) => {
                const t = index.get(l.variante_id);
                if (!t) return null;
                const c = lignesChiffrees.get(l.variante_id);
                const manquant = c ? !c.disponible || c.quantite_disponible < l.quantite : l.quantite > t.declinaison.stock;
                const minimum = t.declinaison.quantite_min > 1 && l.quantite < t.declinaison.quantite_min;
                const libelle = `${t.produit.nom}${t.declinaison.libelle ? `, ${t.declinaison.libelle}` : ""}`;
                return (
                  <li key={l.variante_id} className="sc-ligne" data-manque={manquant || minimum ? "" : undefined}>
                    <Vignette image={t.declinaison.image ?? t.produit.image} />
                    <span className="sc-quoi">
                      <b>{t.produit.nom}</b>
                      <span className="discret">{t.declinaison.libelle ? `${t.declinaison.libelle} · ` : ""}<span className="sc-sku">{t.declinaison.sku}</span></span>
                      {manquant ? <span className="sc-alerte">Plus que {t.declinaison.stock} en stock</span> : null}
                      {minimum ? <span className="sc-alerte">Vendu par {t.declinaison.quantite_min} au moins</span> : null}
                      {c?.palier ? <span className="sc-palier">Prix par {c.palier} appliqué</span> : null}
                      {c?.prix_public_millimes ? <span className="sc-palier">Prix pro (public : {formatePrix(c.prix_public_millimes)})</span> : null}
                    </span>
                    <span className="sc-quantite">
                      <button type="button" className="btn-icone" onClick={() => quantite(l.variante_id, l.quantite - 1)}
                              disabled={l.quantite <= 1} aria-label={`Une de moins : ${libelle}`}>
                        <Icone nom="moins" taille={14} />
                      </button>
                      <input name={`l:${l.variante_id}`} className="entree tabular-nums" inputMode="numeric" value={l.quantite}
                             aria-label={`Quantité : ${libelle}`}
                             onChange={(e) => { const q = Number(chiffres(e.target.value)); if (q > 0) quantite(l.variante_id, q); }} />
                      <button type="button" className="btn-icone" onClick={() => quantite(l.variante_id, l.quantite + 1)}
                              aria-label={`Une de plus : ${libelle}`}>
                        <Icone nom="plus" taille={14} />
                      </button>
                    </span>
                    <span className="sc-total-ligne tabular-nums">
                      {c?.total_ligne_millimes != null ? formatePrix(c.total_ligne_millimes) : formatePrix(t.declinaison.prix_millimes * l.quantite)}
                    </span>
                    <button type="button" className="btn-icone sc-retirer" onClick={() => retire(l.variante_id)} aria-label={`Retirer ${libelle}`}>
                      <Icone nom="corbeille" taille={15} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>

        {/* 4 · La livraison */}
        <fieldset className="carte sc-carte">
          <legend className="sc-titre"><span className="sc-num" aria-hidden="true">4</span> La livraison</legend>
          {saisie.retrait || canal === "magasin" ? (
            <fieldset className="segments sc-modes">
              <legend>Mode de livraison</legend>
              {canal === "magasin" ? (
                <label><input type="radio" name="mode-choix" checked={comptoir} onChange={() => setMode("comptoir")} /> <Icone nom="coche" taille={14} /> Remis sur place</label>
              ) : null}
              <label><input type="radio" name="mode-choix" checked={mode === "domicile"} onChange={() => setMode("domicile")} /> <Icone nom="camion" taille={14} /> À domicile</label>
              {saisie.retrait ? (
                <label><input type="radio" name="mode-choix" checked={mode === "retrait"} onChange={() => setMode("retrait")} /> <Icone nom="boutique" taille={14} /> Retrait plus tard</label>
              ) : null}
            </fieldset>
          ) : null}
          {comptoir ? (
            <p className="sc-magasin">
              <Icone nom="boutique" taille={15} /> Le client repart avec ses articles et paie au comptoir : la vente est enregistrée remise et payée, le stock sorti.
            </p>
          ) : mode === "retrait" && saisie.retrait ? (
            <p className="sc-magasin">
              <Icone nom="boutique" taille={15} /> Le client vient au magasin : {saisie.retrait.adresse}{saisie.retrait.ville ? `, ${saisie.retrait.ville}` : ""}
              {saisie.retrait.horaires ? <span className="discret"> · {saisie.retrait.horaires}</span> : null}. Sans frais de livraison.
            </p>
          ) : (
            <div className="sc-grille">
              <div className="champ sc-large">
                <label htmlFor={`${id}-l1`}>Adresse</label>
                <input id={`${id}-l1`} name="ligne1" autoComplete="off" maxLength={200} placeholder="Rue, numéro, immeuble"
                       value={adresse.ligne1} onChange={(e) => setAdresse((a) => ({ ...a, ligne1: e.target.value }))} />
              </div>
              <div className="champ sc-large">
                <label htmlFor={`${id}-l2`}>Complément <span className="facultatif">(facultatif)</span></label>
                <input id={`${id}-l2`} name="ligne2" autoComplete="off" maxLength={200} placeholder="Étage, repère pour le livreur"
                       value={adresse.ligne2} onChange={(e) => setAdresse((a) => ({ ...a, ligne2: e.target.value }))} />
              </div>
              <div className="champ">
                <label htmlFor={`${id}-ville`}>Ville ou délégation</label>
                <input id={`${id}-ville`} name="ville" autoComplete="off" maxLength={80}
                       value={adresse.ville} onChange={(e) => setAdresse((a) => ({ ...a, ville: e.target.value }))} />
              </div>
              <div className="champ">
                <label htmlFor={`${id}-gouv`}>Gouvernorat</label>
                <select id={`${id}-gouv`} name="gouvernorat" value={adresse.gouvernorat}
                        onChange={(e) => setAdresse((a) => ({ ...a, gouvernorat: e.target.value }))}>
                  <option value="">Choisir…</option>
                  {gouvernorats.map((g) => <option key={g.code} value={g.code}>{g.nom}</option>)}
                </select>
              </div>
              <div className="champ">
                <label htmlFor={`${id}-cp`}>Code postal <span className="facultatif">(facultatif)</span></label>
                <input id={`${id}-cp`} name="code_postal" inputMode="numeric" autoComplete="off" maxLength={4}
                       value={adresse.code_postal} onChange={(e) => setAdresse((a) => ({ ...a, code_postal: chiffres(e.target.value).slice(0, 4) }))} />
              </div>
            </div>
          )}
        </fieldset>

        {/* 5 · Le prix (la direction) et la confirmation */}
        <fieldset className="carte sc-carte">
          <legend className="sc-titre"><span className="sc-num" aria-hidden="true">5</span> Pour finir</legend>
          {saisie.direction ? (
            <div className="sc-grille sc-ajustements">
              <div className="champ">
                <label htmlFor={`${id}-remise`}>Remise accordée <span className="facultatif">(TND)</span></label>
                <input id={`${id}-remise`} name="remise" inputMode="decimal" autoComplete="off" placeholder="0,000"
                       aria-invalid={remiseIllisible || erreurChiffrage?.indice === "remise" || undefined}
                       aria-describedby={`${id}-remise-aide`}
                       value={remise} onChange={(e) => setRemise(e.target.value)} />
                <p id={`${id}-remise-aide`} className={remiseIllisible || erreurChiffrage?.indice === "remise" ? "sc-erreur-champ" : "aide"}>
                  {remiseIllisible ? "Un montant en dinars, par exemple 10 ou 9,500." : erreurChiffrage?.indice === "remise" ? erreurChiffrage.texte : "Retirée du prix des articles."}
                </p>
              </div>
              <label className="opt sc-offerte">
                <input type="checkbox" name="offerte" checked={offerte} onChange={(e) => setOfferte(e.target.checked)} disabled={mode !== "domicile"} />
                Livraison offerte
              </label>
            </div>
          ) : null}
          {comptoir ? null : (
            <label className="choix-carte sc-confirmee">
              <input type="checkbox" name="confirmee" checked={confirmee} onChange={(e) => setConfirmee(e.target.checked)} />
              <span>
                <b>Le client a confirmé sa commande</b>
                <span className="aide">
                  {confirmee ? "Elle part directement en préparation." : "Elle attendra sa confirmation, avec les commandes de la vitrine."}
                </span>
              </span>
            </label>
          )}
          <div className="champ">
            <label htmlFor={`${id}-note`}>Note interne <span className="facultatif">(facultatif, l&apos;équipe seule la lit)</span></label>
            <textarea id={`${id}-note`} name="note" maxLength={500} rows={2} placeholder="Prix négocié, heure d'appel, cadeau…"
                      value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </fieldset>
      </div>

      {/* Le récapitulatif : ce que le client paiera, ce qui manque encore. */}
      <aside className="carte sc-recap" aria-label="Récapitulatif">
        <h2 className="sc-recap-titre">Récapitulatif</h2>
        <dl className="sc-montants" aria-busy={calcul}>
          <div><dt>Articles{pieces ? ` (${pieces})` : ""}</dt><dd className="tabular-nums">{chiffrage ? formatePrix(chiffrage.sous_total_millimes) : "—"}</dd></div>
          <div>
            <dt>{comptoir ? "Remis sur place" : mode === "retrait" ? "Retrait au magasin" : `Livraison${chiffrage?.zone?.nom_fr ? ` · ${chiffrage.zone.nom_fr}` : nomGouvernorat ? ` · ${nomGouvernorat}` : ""}`}</dt>
            <dd className="tabular-nums">
              {comptoir ? "Sans livraison" : mode === "retrait" ? "Gratuit" : !chiffrage ? "—" : chiffrage.frais_livraison_millimes === null ? "Le gouvernorat ?" : chiffrage.livraison_offerte ? (
                <><s className="discret">{formatePrix(chiffrage.frais_boutique_millimes ?? 0)}</s> Offerte</>
              ) : chiffrage.frais_livraison_millimes === 0 ? "Gratuite" : formatePrix(chiffrage.frais_livraison_millimes)}
            </dd>
          </div>
          {chiffrage && chiffrage.remise_millimes > 0 ? (
            <div className="sc-remise"><dt>Remise</dt><dd className="tabular-nums">− {formatePrix(chiffrage.remise_millimes)}</dd></div>
          ) : null}
          <div className="sc-total"><dt>À payer {comptoir ? "au comptoir" : mode === "retrait" ? "au retrait" : "à la livraison"}</dt><dd className="tabular-nums" aria-live="polite">{total !== null ? formatePrix(total) : "—"}</dd></div>
        </dl>
        {chiffrage?.tarif === "pro" ? <p className="sc-note-recap"><Icone nom="bouclier" taille={14} /> Prix pro du client</p> : null}
        {erreurChiffrage && erreurChiffrage.indice !== "remise" ? <p className="sc-erreur-champ" role="alert">{erreurChiffrage.texte}</p> : null}
        {!enStock ? <p className="sc-erreur-champ" role="alert">{messageSaisie("stock", "")}</p> : null}
        {manque.length ? <p className="sc-manque">Il manque {manque.join(", ")}.</p> : null}
        {bouton("sc-envoyer", true)}
      </aside>

      {/* Au téléphone : le total et l'envoi restent sous le pouce. */}
      <div className="sc-barre">
        <p className="sc-barre-total"><span>Total</span> <b className="tabular-nums">{total !== null ? formatePrix(total) : "—"}</b></p>
        {bouton("sc-envoyer-barre", false)}
      </div>
    </form>
  );
}

function Vignette({ image }: { image: string | null }) {
  return (
    <span className="rc-vignette sc-vignette" aria-hidden="true">
      {image ? <Image src={urlFichier(image)} alt="" fill sizes="40px" /> : <Icone nom="colis" taille={16} />}
    </span>
  );
}
