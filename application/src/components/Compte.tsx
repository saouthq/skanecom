"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Coche } from "./Icones";
import { EspacePro } from "./EspacePro";
import { MesDevis } from "./MesDevis";
import { AvisCommande } from "./DonnerAvis";
import { Connexion } from "./Connexion";
import { Prix } from "./Prix";
import { supabaseNavigateur } from "@/lib/supabase-navigateur";
import { lieu, telephoneLisible, type Magasin } from "@/lib/commande";
import { sessionAcheteur, type SessionAcheteur, type Verification } from "@/lib/connexion";
import { urlFichier } from "@/lib/photos";
import { t } from "@/lib/i18n";
import type { MonAvis } from "@/lib/avis";

/* ============================================================================
   MES COMMANDES — le compte de l'acheteur dans cette boutique : son numéro
   ou son adresse e-mail, confirmé par un code (SMS ou e-mail, selon le
   réglage compte.verification ; le même compte que celui du tunnel), et ses
   commandes, la plus récente d'abord, avec ce qu'il doit savoir de chacune
   (où elle en est, où elle va, le suivi du transporteur).

   Tout se lit dans le navigateur, avec la session de l'acheteur :
   public.mes_commandes ne rend que ses commandes, et rien de ce que
   l'équipe en écrit. La page servie est la même pour tous (aucune donnée
   personnelle dans le cache).

   Avec le service après-vente (module sav), une commande livrée propose
   « Un problème avec un article ? » : l'article, le numéro de série, ce qui
   ne va pas (public.sav_demander) ; ses demandes et où elles en sont
   s'affichent en tête (public.mes_sav, sans les notes de l'équipe).

   Avec les comptes professionnels (module comptes_pro), l'espace pro vient
   sous l'identité : demander un compte, ou lire où en est le sien
   (EspacePro.tsx). Avec la demande de devis (module devis), « Mes devis »
   (MesDevis.tsx) : les prix, et « Accepter et commander ».
   ========================================================================== */

type LigneMienne = { id: string; produit_nom: string; variante_libelle: string | null; quantite: number; image: string | null };

type DemandeMienne = {
  numero: string;
  statut: string;
  issue: string | null;
  commande: string;
  ligne_id: string;
  produit_nom: string;
  variante_libelle: string | null;
  cree_le: string;
};

export type CommandeMienne = {
  numero: string;
  statut: string;
  cree_le: string;
  mode_livraison: "domicile" | "retrait";
  ville: string | null;
  gouvernorat: string | null;
  magasin: Magasin | null;
  total_millimes: number;
  transporteur: string | null;
  numero_suivi: string | null;
  lignes: LigneMienne[];
};

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Tunis" });

export function Compte({ boutiqueId, verification, sav = false, pro = false, devis = false, avis = false, avisPhotos = false }: {
  boutiqueId: string;
  verification: Verification;
  sav?: boolean;
  pro?: boolean;
  devis?: boolean;
  /** Module avis : sous une commande livrée, chaque article à noter. */
  avis?: boolean;
  /** Réglage avis.photos : des photos jointes à l'avis. */
  avisPhotos?: boolean;
}) {
  // undefined : la session n'est pas encore lue.
  const [session, setSession] = useState<SessionAcheteur | null | undefined>(undefined);
  const [commandes, setCommandes] = useState<CommandeMienne[] | null>(null);
  const [erreurListe, setErreurListe] = useState(false);
  const [demandes, setDemandes] = useState<DemandeMienne[]>([]);
  const [relecture, setRelecture] = useState(0);
  const [mesAvis, setMesAvis] = useState<MonAvis[]>([]);
  const [relectureAvis, setRelectureAvis] = useState(0);

  useEffect(() => {
    const { data } = supabaseNavigateur().auth.onAuthStateChange((_evenement, s) => setSession(sessionAcheteur(s?.user)));
    return () => data.subscription.unsubscribe();
  }, []);

  // Les commandes, dès que la session est là.
  useEffect(() => {
    if (!session) return;
    let actif = true;
    supabaseNavigateur()
      .rpc("mes_commandes", { p_boutique_id: boutiqueId })
      .then(({ data, error }) => {
        if (!actif) return;
        if (error) setErreurListe(true);
        else {
          setErreurListe(false);
          setCommandes((data as CommandeMienne[] | null) ?? []);
        }
      });
    return () => {
      actif = false;
    };
  }, [session, boutiqueId]);

  // Les demandes de SAV, avec le module ; relues après chaque demande.
  useEffect(() => {
    if (!session || !sav) return;
    let actif = true;
    supabaseNavigateur()
      .rpc("mes_sav", { p_boutique_id: boutiqueId })
      .then(({ data, error }) => {
        if (actif && !error) setDemandes((data as DemandeMienne[] | null) ?? []);
      });
    return () => {
      actif = false;
    };
  }, [session, sav, boutiqueId, relecture]);

  // Les avis déjà donnés, avec le module ; relus après chaque avis.
  useEffect(() => {
    if (!session || !avis) return;
    let actif = true;
    supabaseNavigateur()
      .rpc("mes_avis", { p_boutique_id: boutiqueId })
      .then(({ data, error }) => {
        if (actif && !error) setMesAvis((data as MonAvis[] | null) ?? []);
      });
    return () => {
      actif = false;
    };
  }, [session, avis, boutiqueId, relectureAvis]);

  async function deconnecter() {
    await supabaseNavigateur().auth.signOut();
    setCommandes(null);
  }

  if (session === undefined) {
    return <div className="compte-attente" aria-busy="true">{t.commun.chargement}</div>;
  }

  if (!session) {
    return <Connexion titre={t.compte.connexionTitre} texte={t.compte.connexionTexte(verification)} verification={verification} />;
  }

  return (
    <div className="compte">
      <div className="compte-identite">
        <p>
          <Coche taille={18} />{" "}
          <span>{session.telephone ? t.compte.connecte(telephoneLisible(session.telephone)) : t.compte.connecteEmail(session.email ?? "")}</span>
        </p>
        <button type="button" className="btn-lien legende" onClick={() => void deconnecter()}>{t.compte.deconnexion}</button>
      </div>

      {pro ? <EspacePro boutiqueId={boutiqueId} /> : null}
      {devis ? <MesDevis boutiqueId={boutiqueId} /> : null}

      {erreurListe ? (
        <p className="tunnel-alerte" role="alert">{t.compte.erreur}</p>
      ) : commandes === null ? (
        <div className="compte-attente" aria-busy="true">{t.compte.chargement}</div>
      ) : commandes.length === 0 ? (
        <div className="listing-vide compte-vide">
          <h2>{t.compte.aucune}</h2>
          <p>{t.compte.aucuneTexte}</p>
          <a className="btn btn-primaire" href="/catalogue">{t.compte.commander}</a>
        </div>
      ) : (
        <>
          {demandes.length > 0 ? (
            <section className="sav-mes" aria-labelledby="sav-mes-titre">
              <h2 id="sav-mes-titre">{t.sav.mesDemandes}</h2>
              <ul role="list">
                {demandes.map((d) => {
                  const issue = d.issue ? t.sav.issue[d.issue] : "";
                  return (
                    <li key={d.numero} className="sav-mes-ligne" data-statut={d.statut}>
                      <span className="sav-mes-texte">
                        <b>{d.produit_nom}</b>
                        <span className="legende">{d.numero} · {t.sav.surCommande(d.commande)}</span>
                      </span>
                      <span className="sav-mes-statut">{t.sav.statut[d.statut] ?? d.statut}{issue ? ` : ${issue}` : ""}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          <ul className="compte-liste" role="list">
            {commandes.map((c) => (
              <Carte
                key={c.numero}
                c={c}
                boutiqueId={boutiqueId}
                sav={sav}
                demandes={demandes}
                surDemande={() => setRelecture((n) => n + 1)}
                avis={avis}
                avisPhotos={avisPhotos}
                mesAvis={mesAvis}
                surAvis={() => setRelectureAvis((n) => n + 1)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Le rang d'une commande sur sa frise ; refusée ou annulée : pas de frise. */
const RANG_FRISE: Record<string, number> = { a_arbitrer: 0, recue: 0, confirmee: 1, expediee: 2, livree: 3 };

/** Reçue → confirmée → expédiée (prête) → livrée (retirée) : l'étape du
 *  moment est marquée, celles d'avant sont faites. */
function Frise({ statut, retrait }: { statut: string; retrait: boolean }) {
  const rang = RANG_FRISE[statut];
  if (rang === undefined) return null;
  const etapes = retrait ? t.compte.friseRetrait : t.compte.frise;
  return (
    <ol className="compte-frise" aria-label={t.compte.friseAria}>
      {etapes.map((e, i) => (
        <li key={e} data-faite={i <= rang ? "" : undefined} aria-current={i === rang ? "step" : undefined} style={{ "--i": i } as React.CSSProperties}>
          <span className="compte-frise-point" aria-hidden="true">
            {i < rang || (i === rang && rang === etapes.length - 1) ? <Coche taille={11} /> : null}
          </span>
          <span className="compte-frise-nom">{e}</span>
        </li>
      ))}
    </ol>
  );
}

/** Ce qu'on lit d'une commande : son numéro, sa date, son état et sa frise,
 *  son contenu, où elle va et le suivi du transporteur. Partagé avec le
 *  suivi sans compte (SuiviCommande.tsx). */
export function ResumeCommande({ c }: { c: CommandeMienne }) {
  const retrait = c.mode_livraison === "retrait";
  const statut = (retrait ? t.commande.statutRetrait[c.statut] : undefined) ?? t.commande.statut[c.statut] ?? c.statut;
  const etat = (retrait ? t.compte.etatRetrait[c.statut] : undefined) ?? t.compte.etat[c.statut] ?? "";
  const articles = c.lignes.reduce((n, l) => n + l.quantite, 0);
  const vignettes = c.lignes.slice(0, 3);
  const suivi = !retrait && (c.transporteur || c.numero_suivi) ? t.compte.suivi(c.transporteur, c.numero_suivi) : null;
  const magasin = c.magasin ? `${c.magasin.adresse}, ${c.magasin.ville}` : t.commande.modeRetrait.toLowerCase();
  const destination = retrait
    ? (c.statut === "livree" ? t.compte.retireeA(magasin) : t.compte.retraitA(magasin))
    : c.ville
      ? t.compte.livraisonA(lieu(c.ville, c.gouvernorat))
      : null;
  return (
    <>
      <div className="compte-carte-tete">
        <div>
          <p className="compte-numero">{c.numero}</p>
          <p className="legende">{t.compte.passeeLe(JOUR.format(new Date(c.cree_le)))}</p>
        </div>
        <span className="compte-statut">{statut}</span>
      </div>
      <Frise statut={c.statut} retrait={retrait} />
      <p className="compte-etat">{etat}</p>
      <div className="compte-contenu">
        <span className="compte-vignettes" aria-hidden="true">
          {vignettes.map((l, i) => (
            <span key={`${l.produit_nom}-${i}`} className="tunnel-vignette">
              {l.image ? <Image src={urlFichier(l.image)} alt="" fill sizes="48px" /> : <span className="attente-photo"><span className="filigrane" /></span>}
            </span>
          ))}
          {c.lignes.length > 3 ? <span className="compte-plus">+{c.lignes.length - 3}</span> : null}
        </span>
        <span className="compte-resume">
          <span>{c.lignes.map((l) => l.produit_nom).join(", ")}</span>
          <span className="legende">{t.compte.articles(articles)} · <Prix millimes={c.total_millimes} /></span>
        </span>
      </div>
      {destination || suivi ? (
        <p className="compte-destination legende">
          {destination}
          {destination && suivi ? " · " : ""}
          {suivi}
        </p>
      ) : null}
    </>
  );
}

function Carte({ c, boutiqueId, sav, demandes, surDemande, avis, avisPhotos, mesAvis, surAvis }: {
  c: CommandeMienne;
  boutiqueId: string;
  sav: boolean;
  demandes: DemandeMienne[];
  surDemande: () => void;
  avis: boolean;
  avisPhotos: boolean;
  mesAvis: MonAvis[];
  surAvis: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [envoyee, setEnvoyee] = useState<string | null>(null);
  const cloturee = ["livree", "refusee", "annulee"].includes(c.statut);

  return (
    <li className="compte-carte" data-statut={c.statut} data-cloturee={cloturee ? "" : undefined}>
      <ResumeCommande c={c} />
      {sav && c.statut === "livree" ? (
        <div className="sav-carte">
          {envoyee ? <p className="sav-envoyee" role="status"><Coche taille={16} /> {t.sav.envoyee(envoyee)}</p> : null}
          {ouvert ? (
            <Signaler
              boutiqueId={boutiqueId}
              commande={c}
              ouvertes={demandes.filter((d) => d.commande === c.numero && (d.statut === "nouvelle" || d.statut === "en_cours"))}
              fermer={() => setOuvert(false)}
              envoye={(numero) => {
                setOuvert(false);
                setEnvoyee(numero);
                surDemande();
              }}
            />
          ) : (
            <button type="button" className="btn-lien sav-signaler" onClick={() => { setEnvoyee(null); setOuvert(true); }} aria-expanded={false}>
              {t.sav.signaler}
            </button>
          )}
        </div>
      ) : null}
      {avis && c.statut === "livree" ? (
        <AvisCommande
          boutiqueId={boutiqueId}
          numero={c.numero}
          lignes={c.lignes}
          mesAvis={mesAvis.filter((a) => a.commande === c.numero)}
          surAvis={surAvis}
          photos={avisPhotos}
        />
      ) : null}
    </li>
  );
}

/** Le formulaire de la demande : l'article (s'il y en a plusieurs), le
 *  numéro de série, ce qui ne va pas. La base revérifie tout. */
function Signaler({ boutiqueId, commande, ouvertes, fermer, envoye }: {
  boutiqueId: string;
  commande: CommandeMienne;
  ouvertes: DemandeMienne[];
  fermer: () => void;
  envoye: (numero: string) => void;
}) {
  const libres = commande.lignes.filter((l) => !ouvertes.some((d) => d.ligne_id === l.id));
  const [article, setArticle] = useState(libres[0]?.id ?? "");
  const [serie, setSerie] = useState("");
  const [probleme, setProbleme] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const refProbleme = useRef<HTMLTextAreaElement>(null);
  const id = `sav-${commande.numero}`;

  async function envoyer() {
    if (probleme.trim().length < 10) {
      setErreur(t.sav.problemeInvalide);
      refProbleme.current?.focus();
      return;
    }
    setEnvoi(true);
    setErreur(null);
    const { data, error } = await supabaseNavigateur().rpc("sav_demander", {
      p_boutique_id: boutiqueId, p_numero_commande: commande.numero, p_ligne_id: article,
      p_numero_serie: serie.trim() || null, p_description: probleme.trim(),
    });
    setEnvoi(false);
    if (error) {
      setErreur(["deja", "trop", "description", "serie", "statut", "module"].includes(error.hint ?? "") ? error.message : t.sav.erreur);
      return;
    }
    envoye(String((data as { numero: string }).numero));
  }

  return (
    <form
      className="sav-formulaire"
      aria-labelledby={`${id}-titre`}
      onSubmit={(e) => {
        e.preventDefault();
        void envoyer();
      }}
    >
      <h3 id={`${id}-titre`}>{t.sav.formulaireTitre}</h3>
      {ouvertes.map((d) => (
        <p key={d.numero} className="legende sav-deja">{d.produit_nom} : {t.sav.enCoursSurArticle(d.numero)}</p>
      ))}
      {commande.lignes.length > 1 ? (
        <fieldset className="sav-articles">
          <legend>{t.sav.quelArticle}</legend>
          {commande.lignes.map((l) => {
            const prise = ouvertes.some((d) => d.ligne_id === l.id);
            return (
              <label key={l.id} className="sav-article-choix" data-pris={prise ? "" : undefined}>
                <input type="radio" name={`${id}-article`} value={l.id} checked={article === l.id} disabled={prise} onChange={() => setArticle(l.id)} />
                <span className="tunnel-vignette">
                  {l.image ? <Image src={urlFichier(l.image)} alt="" fill sizes="40px" /> : <span className="attente-photo"><span className="filigrane" /></span>}
                </span>
                <span>
                  {l.produit_nom}
                  {l.variante_libelle ? <span className="legende"> · {l.variante_libelle}</span> : null}
                </span>
              </label>
            );
          })}
        </fieldset>
      ) : (
        <p className="sav-article-seul">
          {commande.lignes[0]?.produit_nom}
          {commande.lignes[0]?.variante_libelle ? <span className="legende"> · {commande.lignes[0].variante_libelle}</span> : null}
        </p>
      )}
      <div className="champ">
        <label htmlFor={`${id}-probleme`}>{t.sav.probleme}</label>
        <textarea
          id={`${id}-probleme`}
          ref={refProbleme}
          rows={4}
          maxLength={1000}
          value={probleme}
          aria-invalid={erreur === t.sav.problemeInvalide ? true : undefined}
          aria-describedby={`${id}-probleme-aide`}
          onChange={(e) => {
            setProbleme(e.target.value);
            if (erreur === t.sav.problemeInvalide && e.target.value.trim().length >= 10) setErreur(null);
          }}
        />
        <span id={`${id}-probleme-aide`} className="legende">{t.sav.problemeAide}</span>
      </div>
      <div className="champ">
        <label htmlFor={`${id}-serie`}>{t.sav.serie} <span className="legende">({t.commande.facultatif})</span></label>
        <input id={`${id}-serie`} maxLength={60} value={serie} onChange={(e) => setSerie(e.target.value)} autoComplete="off" aria-describedby={`${id}-serie-aide`} />
        <span id={`${id}-serie-aide`} className="legende">{t.sav.serieAide}</span>
      </div>
      {erreur ? <p className="champ-erreur" role="alert">{erreur}</p> : null}
      <div className="sav-gestes">
        <button type="submit" className="btn btn-primaire" disabled={envoi || !article}>{envoi ? t.sav.envoi : t.sav.envoyer}</button>
        <button type="button" className="btn-lien" onClick={fermer}>{t.sav.annuler}</button>
      </div>
    </form>
  );
}
