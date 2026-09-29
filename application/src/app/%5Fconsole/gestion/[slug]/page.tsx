import type { Metadata } from "next";
import Link from "next/link";
import { Prix } from "@/components/Prix";
import { Telephone } from "@/components/Icones";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { lieu } from "@/lib/commande";
import {
  ETAPES,
  LIBELLES_RESULTAT,
  LIBELLES_STATUT,
  age,
  lienAppel,
  telephoneLisible,
  type Etape,
} from "@/lib/gestion/libelles";

export const metadata: Metadata = { title: "Commandes" };

/* ============================================================================
   LES COMMANDES — par étape du travail : à confirmer (la plus ancienne
   d'abord : c'est elle qu'on appelle), à préparer, expédiées, clôturées.

   Sur téléphone, chaque commande à confirmer a son bouton d'appel : on
   appelle depuis la liste, on note le résultat sur la fiche. Les pastilles
   disent ce qu'on doit savoir avant d'appeler : nouveau client, numéro
   vérifié par SMS, refus passés, appels déjà tentés.
   ========================================================================== */

type Ligne = {
  numero: string;
  statut: string;
  cree_le: string;
  contact_nom: string;
  contact_telephone: string;
  ville: string;
  gouvernorat: string;
  total_millimes: number;
  articles: number;
  premier_article: string | null;
  appels: number;
  dernier_appel: string | null;
  client: { nb_commandes: number; nb_refus: number; niveau_risque: string; compte: boolean } | null;
};

type Liste = {
  etape: Etape;
  total: number;
  compteurs: Record<"a_confirmer" | "a_preparer" | "expediees" | "cloturees", number>;
  commandes: Ligne[];
};

const PAR_PAGE = 50;

export default async function Commandes({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ etape?: string; q?: string; page?: string }>;
}) {
  const [{ slug }, recherche] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const etape = ETAPES.find((e) => e.cle === recherche.etape) ?? ETAPES[0];
  const q = (recherche.q ?? "").trim().slice(0, 60);
  const page = Math.max(1, Number.parseInt(recherche.page ?? "1", 10) || 1);

  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_liste_commandes", {
    p_boutique_id: boutique.boutique_id,
    p_etape: etape.cle,
    p_recherche: q || null,
    p_limite: PAR_PAGE,
    p_decalage: (page - 1) * PAR_PAGE,
  });
  if (error) throw new Error(`Commandes illisibles : ${error.message}`);
  const liste = data as Liste;
  const maintenant = new Date();
  const pages = Math.max(1, Math.ceil(liste.total / PAR_PAGE));
  const lien = (e: string, p = 1) => `/gestion/${slug}?etape=${e}${q ? `&q=${encodeURIComponent(q)}` : ""}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <>
      <div className="bo-titre">
        <h1>Commandes</h1>
        <form role="search" method="get" action={`/gestion/${slug}`} className="bo-recherche">
          <input type="hidden" name="etape" value={etape.cle} />
          <label htmlFor="q" className="sr-only">Chercher une commande</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Numéro, nom ou téléphone" autoComplete="off" />
          <button type="submit" className="btn btn-second">Chercher</button>
        </form>
      </div>

      <nav className="bo-etapes" aria-label="Étapes des commandes">
        {ETAPES.map((e) => (
          <Link key={e.cle} href={lien(e.cle)} aria-current={e.cle === etape.cle ? "page" : undefined}>
            {e.libelle}
            {e.cle !== "toutes" ? <span className="bo-compte">{liste.compteurs[e.cle]}</span> : null}
          </Link>
        ))}
      </nav>

      {q ? (
        <p className="bo-resultat" role="status">
          {liste.total} commande{liste.total > 1 ? "s" : ""} pour « {q} » ·{" "}
          <Link href={lien(etape.cle).replace(/&q=[^&]*/, "")} className="bo-lien">effacer</Link>
        </p>
      ) : null}

      {liste.commandes.length === 0 ? (
        <p className="bo-vide">{q ? `Aucune commande « ${etape.libelle.toLowerCase()} » ne correspond à « ${q} ».` : etape.vide}</p>
      ) : (
        <ul className="bo-liste">
          {liste.commandes.map((c) => {
            const aConfirmer = c.statut === "recue" || c.statut === "a_arbitrer";
            return (
              <li key={c.numero} className="bo-ligne" data-statut={c.statut}>
                <Link href={`/gestion/${slug}/commandes/${c.numero}`} className="bo-ligne-lien">
                  <span className="bo-ligne-tete">
                    <span className="bo-numero">{c.numero}</span>
                    <span className={`bo-statut bo-statut-${c.statut}`}>{LIBELLES_STATUT[c.statut] ?? c.statut}</span>
                    <span className="bo-age" title={c.cree_le}>{age(c.cree_le, maintenant)}</span>
                  </span>
                  <span className="bo-ligne-client">
                    <strong>{c.contact_nom}</strong>
                    <span>{telephoneLisible(c.contact_telephone)}</span>
                    <span>{lieu(c.ville, c.gouvernorat)}</span>
                  </span>
                  <span className="bo-ligne-articles">
                    {c.articles} article{c.articles > 1 ? "s" : ""}
                    {c.premier_article ? ` — ${c.premier_article}` : ""}
                  </span>
                  <span className="bo-badges">
                    {c.client?.compte ? <span className="bo-badge bo-badge-ok">Numéro vérifié</span> : null}
                    {c.client && c.client.nb_commandes <= 1 ? <span className="bo-badge">Nouveau client</span> : null}
                    {c.client && c.client.nb_commandes > 1 ? (
                      <span className="bo-badge">{c.client.nb_commandes} commandes</span>
                    ) : null}
                    {c.client && c.client.nb_refus > 0 ? (
                      <span className="bo-badge bo-badge-alerte">
                        {c.client.nb_refus} refus
                      </span>
                    ) : null}
                    {c.client && c.client.niveau_risque !== "normal" ? (
                      <span className="bo-badge bo-badge-alerte">{c.client.niveau_risque === "bloque" ? "Bloqué" : "Surveillé"}</span>
                    ) : null}
                    {aConfirmer && c.appels > 0 ? (
                      <span className="bo-badge">
                        Appelé {c.appels}×{c.dernier_appel ? ` · ${(LIBELLES_RESULTAT[c.dernier_appel] ?? c.dernier_appel).toLowerCase()}` : ""}
                      </span>
                    ) : null}
                  </span>
                  <span className="bo-ligne-total">
                    <Prix millimes={c.total_millimes} />
                  </span>
                </Link>
                {aConfirmer ? (
                  <a className="bo-appel" href={lienAppel(c.contact_telephone)} aria-label={`Appeler ${c.contact_nom} au ${telephoneLisible(c.contact_telephone)}`}>
                    <Telephone taille={20} />
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {pages > 1 ? (
        <nav className="bo-pages" aria-label="Pages">
          {page > 1 ? <Link href={lien(etape.cle, page - 1)} className="btn btn-second">Précédentes</Link> : <span />}
          <span className="text-petit text-encre-doux">
            Page {page} sur {pages}
          </span>
          {page < pages ? <Link href={lien(etape.cle, page + 1)} className="btn btn-second">Suivantes</Link> : <span />}
        </nav>
      ) : null}
    </>
  );
}
