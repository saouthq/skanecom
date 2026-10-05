import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Etoiles } from "@/components/Etoiles";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { Pagination } from "@/components/console/Pagination";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { quand, telephoneLisible } from "@/lib/gestion/libelles";
import { noteLisible } from "@/lib/avis";
import { urlFichier } from "@/lib/photos";
import { CLASSES_STATUT_AVIS, FILTRES_AVIS, LIBELLES_STATUT_AVIS, PEUT_MODERER, type ListeAvis } from "@/lib/gestion/avis";

/** Une page d'avis (…_listes_paginees.sql). */
const PAR_PAGE = 20;

export const metadata: Metadata = { title: "Avis" };

/* ============================================================================
   LES AVIS CLIENTS (module avis) — ceux à relire, le plus ancien d'abord,
   puis les publiés et les écartés. Chaque avis dit qui (le nom montré sur
   la vitrine, et le client derrière), quel article, quelle commande ;
   publier, écarter (avec un motif, gardé ici) ou répondre en public se fait
   sur place. Propriétaire et administrateur ; les autres lisent.
   ========================================================================== */
export default async function Avis({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ filtre?: string; page?: string; ok?: string; erreur?: string }>;
}) {
  const [{ slug }, recherche] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const filtre = FILTRES_AVIS.find((f) => f.cle === recherche.filtre) ?? FILTRES_AVIS[0];
  const sb = await clientSession();
  const page = Math.max(1, Number.parseInt(recherche.page ?? "1", 10) || 1);
  const { data, error } = await sb.rpc("gestion_liste_avis", {
    p_boutique_id: boutique.boutique_id, p_filtre: filtre.cle, p_limite: PAR_PAGE, p_decalage: (page - 1) * PAR_PAGE,
  });
  if (error) throw new Error(`Avis illisibles : ${error.message}`);
  const liste = data as ListeAvis;
  const { a_moderer, publies, ecartes, moyenne } = liste.compteurs;
  if (!liste.actif && a_moderer + publies + ecartes === 0) notFound();
  const base = `/gestion/${slug}/avis`;
  const action = `${base}/action`;
  const modere = PEUT_MODERER.includes(boutique.role);
  const maintenant = new Date();
  const compteurs = { a_moderer, publies, ecartes };
  const pages = Math.max(1, Math.ceil(compteurs[filtre.cle] / PAR_PAGE));
  const lien = (n: number) => `${base}?filtre=${filtre.cle}${n > 1 ? `&page=${n}` : ""}`;

  return (
    <>
      <EnTetePage
        titre="Avis clients"
        description={
          liste.actif
            ? liste.moderation === "automatique"
              ? "Les avis paraissent dès qu'un client livré les donne : écartez ceux qui n'ont pas leur place, répondez aux autres."
              : "Chaque avis attend votre relecture avant de paraître sur la fiche du produit. Seul un client livré peut noter l'article reçu."
            : "Le module est coupé : la vitrine ne montre plus d'avis. Ils restent ici, tels quels."
        }
        actions={
          <Link className="btn btn-second" href={`/gestion/${slug}/reglages/service#t-avis`}>
            <Icone nom="reglages" /> {liste.moderation === "automatique" ? "Publication automatique" : "Relecture avant publication"}
          </Link>
        }
      />

      {recherche.ok ? <p className="message message-succes" role="status">{recherche.ok}</p> : null}
      {recherche.erreur ? <p className="message message-erreur" role="alert">{recherche.erreur}</p> : null}

      {moyenne !== null ? (
        <section className="carte av-synthese" aria-label="La note de la boutique">
          <span className="av-synthese-note">{noteLisible(moyenne)}<span className="discret">/5</span></span>
          <Etoiles note={moyenne} taille={18} />
          <span className="aide">{publies} avis publié{publies > 1 ? "s" : ""} · moyenne sur tous les produits</span>
        </section>
      ) : null}

      <nav className="onglets" aria-label="Filtres des avis">
        {FILTRES_AVIS.map((f) => (
          <Link key={f.cle} href={`${base}?filtre=${f.cle}`} aria-current={f.cle === filtre.cle ? "page" : undefined}>
            {f.libelle}
            <span className={`compte-onglet${f.cle === "a_moderer" && a_moderer > 0 ? " compte-alerte" : ""}`}>{compteurs[f.cle]}</span>
          </Link>
        ))}
      </nav>

      {liste.avis.length === 0 ? (
        <div className="vide cat-vide">
          <span className="vide-icone"><Icone nom="etoile" taille={20} /></span>
          <strong>Rien ici</strong>
          <p>{filtre.vide}</p>
        </div>
      ) : (
        <ul className="av-liste" role="list">
          {liste.avis.map((a) => (
            <li key={a.id} className="carte av-carte" data-statut={a.statut} id={`avis-${a.id}`}>
              <div className="av-tete">
                <Etoiles note={a.note} taille={16} />
                <span className={CLASSES_STATUT_AVIS[a.statut]}>{LIBELLES_STATUT_AVIS[a.statut]}</span>
                <span className="discret av-quand">{quand(a.cree_le, maintenant)}</span>
              </div>
              {a.texte ? <blockquote className="av-texte">« {a.texte} »</blockquote> : <p className="discret av-texte-vide">La note seule, sans texte.</p>}
              {a.photos.length > 0 ? (
                <ul className="av-photos" role="list" aria-label={`Les photos du client (${a.photos.length})`}>
                  {a.photos.map((ph, i) => (
                    <li key={ph.id} className="av-photo">
                      <a href={urlFichier(ph.chemin)} target="_blank" rel="noopener" className="av-photo-lien" aria-label={`Voir la photo ${i + 1} en grand`}>
                        <Image src={urlFichier(ph.chemin)} alt="" fill sizes="112px" />
                      </a>
                      {modere ? (
                        <form action={action} method="post">
                          <input type="hidden" name="avis" value={a.id} />
                          <input type="hidden" name="photo" value={ph.id} />
                          <input type="hidden" name="geste" value="retirer_photo" />
                          <input type="hidden" name="filtre" value={filtre.cle} />
                          <button className="btn-lien av-photo-retirer" aria-label={`Retirer la photo ${i + 1} de cet avis`}>Retirer</button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="aide av-qui">
                <b className="font-medium">{a.auteur}</b> sur la vitrine ·{" "}
                <Link href={`/gestion/${slug}/clients/${a.client.id}`}>{a.client.nom ?? telephoneLisible(a.client.telephone)}</Link>
                {" · "}
                <Link href={`/gestion/${slug}/produits/${a.produit.id}`}>{a.produit.nom}</Link>
                {a.variante_libelle ? ` (${a.variante_libelle})` : ""}
                {" · "}
                <Link href={`/gestion/${slug}/commandes/${a.commande}`}>{a.commande}</Link>
              </p>
              {a.statut === "ecarte" && a.motif ? (
                <p className="message av-motif">Écarté{a.modere_par ? ` par ${a.modere_par}` : ""} : {a.motif}</p>
              ) : null}
              {a.reponse ? (
                <div className="av-reponse">
                  <b>Votre réponse, publique</b>
                  <p>{a.reponse}</p>
                </div>
              ) : null}

              {modere ? (
                <div className="av-gestes">
                  {a.statut !== "publie" ? (
                    <form action={action} method="post">
                      <input type="hidden" name="avis" value={a.id} />
                      <input type="hidden" name="geste" value="publier" />
                      <input type="hidden" name="filtre" value={filtre.cle} />
                      <button className="btn btn-primaire btn-petit"><Icone nom="coche" taille={14} /> Publier</button>
                    </form>
                  ) : null}
                  {a.statut !== "ecarte" ? (
                    <details className="av-pli">
                      <summary className="btn btn-second btn-petit">{a.reponse ? "Modifier la réponse" : "Répondre"}</summary>
                      <form action={action} method="post" className="av-pli-form">
                        <input type="hidden" name="avis" value={a.id} />
                        <input type="hidden" name="geste" value="repondre" />
                        <input type="hidden" name="filtre" value={filtre.cle} />
                        <label className="sr-only" htmlFor={`rep-${a.id}`}>Votre réponse</label>
                        <textarea id={`rep-${a.id}`} name="texte" rows={3} maxLength={1000} defaultValue={a.reponse ?? ""}
                          placeholder="Merci pour votre avis… (vide : la réponse s'efface)" />
                        <button className="btn btn-primaire btn-petit">Enregistrer la réponse</button>
                      </form>
                    </details>
                  ) : null}
                  {a.statut !== "ecarte" ? (
                    <details className="av-pli">
                      <summary className="btn btn-second btn-petit">Écarter</summary>
                      <form action={action} method="post" className="av-pli-form">
                        <input type="hidden" name="avis" value={a.id} />
                        <input type="hidden" name="geste" value="ecarter" />
                        <input type="hidden" name="filtre" value={filtre.cle} />
                        <label htmlFor={`motif-${a.id}`}>Pourquoi <span className="discret">(pour l&apos;équipe seulement)</span></label>
                        <input id={`motif-${a.id}`} name="texte" maxLength={300} required placeholder="Ex. Parle du livreur, pas du produit" />
                        <button className="btn btn-danger btn-petit">Écarter l&apos;avis</button>
                      </form>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pages={pages} total={compteurs[filtre.cle]} parPage={PAR_PAGE} lien={lien} unite={["avis", "avis"]} />
    </>
  );
}
