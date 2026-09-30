import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prix } from "@/components/Prix";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { FormDevis } from "@/components/console/FormDevis";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { lienAppel, lienWhatsApp, quand, telephoneLisible } from "@/lib/gestion/libelles";
import { formateMontant } from "@/lib/prix";
import { CLASSES_STATUT_DEVIS, LIBELLES_STATUT_DEVIS, PEUT_CHIFFRER, type FicheDevis } from "@/lib/gestion/devis";

export const metadata: Metadata = { title: "Devis" };

const JOUR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Africa/Tunis" });
const jour = (d: string) => JOUR.format(new Date(`${d}T12:00:00`));

/* ============================================================================
   LA FICHE D'UN DEVIS — qui le demande (ses commandes, ses refus, son compte
   pro), ce qu'il a écrit, et le chiffrage ligne par ligne (FormDevis). Une
   fois envoyé : le message WhatsApp prêt (« votre devis est prêt »), la
   validité ; accepté : la commande qu'il est devenu. Chiffrer, envoyer,
   annuler : propriétaire et administrateur ; les autres lisent.
   ========================================================================== */
export default async function FicheDevisBackoffice({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; numero: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const [{ slug, numero }, messages] = await Promise.all([params, searchParams]);
  if (!/^DEV-\d{5,}$/.test(numero)) notFound();
  const { boutique } = await exigeMembre(slug);
  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_devis", { p_boutique_id: boutique.boutique_id, p_numero: numero });
  if (error) throw new Error(`Devis illisible : ${error.message}`);
  if (!data) notFound();
  const d = data as FicheDevis;
  const chiffre = PEUT_CHIFFRER.includes(boutique.role);
  const ouvert = d.statut === "demande" || d.statut === "envoye";
  const action = `/gestion/${slug}/devis/${d.numero}/action`;
  const maintenant = new Date();
  const prenom = (d.client.nom ?? "").split(/\s+/)[0] || "";
  const totalAvecFrais = d.total_millimes !== null ? d.total_millimes + (d.frais_livraison_millimes ?? 0) : null;
  const messageWhatsApp =
    d.statut === "envoye" && totalAvecFrais !== null && d.valide_jusqu_au
      ? `Bonjour${prenom ? ` ${prenom}` : ""}, ici ${boutique.nom}. Votre devis ${d.numero} est prêt : ${formateMontant(totalAvecFrais)} TND${d.frais_livraison_millimes === null ? " (plus la livraison)" : ""}, valable jusqu'au ${jour(d.valide_jusqu_au)}. Vous le retrouvez dans « Mes commandes » sur notre boutique en ligne, pour l'accepter en un clic.`
      : `Bonjour${prenom ? ` ${prenom}` : ""}, ici ${boutique.nom}, à propos de votre demande de devis ${d.numero}.`;

  return (
    <>
      <EnTetePage
        avant={<Link href={`/gestion/${slug}/devis`}><Icone nom="retour" taille={14} /> Devis</Link>}
        titre={
          <>
            {d.numero}
            <span className={CLASSES_STATUT_DEVIS[d.statut]}>{LIBELLES_STATUT_DEVIS[d.statut]}</span>
          </>
        }
        description={
          <>
            <Link href={`/gestion/${slug}/clients/${d.client.id}`}>{d.client.nom ?? "Fiche client"}</Link>
            {" · "}<span className="tabular-nums">{telephoneLisible(d.client.telephone)}</span>
            {d.client.pro ? <> · <span className="ui-etat ui-etat-violet">Pro · {d.client.pro}</span></> : null}
            {" · demandé "}{quand(d.cree_le, maintenant)}
          </>
        }
        actions={
          <>
            <a className="btn btn-second" href={lienWhatsApp(d.client.telephone, messageWhatsApp)} target="_blank" rel="noreferrer">
              <Icone nom="message" /> WhatsApp
            </a>
            <a className="btn btn-primaire" href={lienAppel(d.client.telephone)}><Icone nom="telephone" /> Appeler</a>
          </>
        }
      />

      <div className="pile">
        {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
        {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}

        {d.message ? (
          <section className="carte dv-demande" aria-label="Ce que le client a écrit">
            <Icone nom="note" />
            <blockquote>« {d.message} »</blockquote>
            <span className="aide">
              {d.client.commandes} commande{d.client.commandes > 1 ? "s" : ""}
              {d.client.refus > 0 ? <span className="pro-refus"> · {d.client.refus} refus</span> : null}
            </span>
          </section>
        ) : null}

        {d.statut === "accepte" && d.commande ? (
          <p className="message message-succes">
            Accepté par le client : c&apos;est la commande <Link href={`/gestion/${slug}/commandes/${d.commande}`}>{d.commande}</Link>, à confirmer comme les autres.
          </p>
        ) : null}
        {d.statut === "envoye" && d.valide_jusqu_au ? (
          <p className="message">Envoyé {d.envoye_le ? quand(d.envoye_le, maintenant) : ""}{d.envoye_par ? ` par ${d.envoye_par}` : ""} · valable jusqu&apos;au {jour(d.valide_jusqu_au)}. Le client le voit dans « Mes commandes ».</p>
        ) : null}

        <section className="carte carte-plate" aria-labelledby="t-chiffrage" id="chiffrage">
          <div className="carte-tete">
            <div>
              <h2 id="t-chiffrage" className="carte-titre-icone"><Icone nom="billet" /> {ouvert && chiffre ? "Chiffrage" : "Lignes du devis"}</h2>
              <p>
                {ouvert && chiffre
                  ? "Le prix pro est proposé quand il existe. Le stock n'est pas réservé : il le sera à la commande."
                  : `${d.lignes.length} article${d.lignes.length > 1 ? "s" : ""}.`}
              </p>
            </div>
          </div>
          {ouvert && chiffre ? (
            <FormDevis action={action} lignes={d.lignes} frais={d.frais_livraison_millimes} note={d.note} version={d.version} envoye={d.statut === "envoye"} />
          ) : (
            <ul className="dv-lignes dv-lecture" role="list">
              {d.lignes.map((l) => (
                <li key={l.id} className="dv-ligne">
                  <span className="dv-ligne-quoi">
                    <b>{l.produit_nom}</b>
                    <span className="discret">{[l.variante_libelle, l.sku].filter(Boolean).join(" · ")} · × {l.quantite}</span>
                  </span>
                  <span className="discret tabular-nums">{l.prix_devis_millimes !== null ? `${formateMontant(l.prix_devis_millimes)} TND` : "—"}</span>
                  <span className="dv-ligne-total">{l.prix_devis_millimes !== null ? <Prix millimes={l.prix_devis_millimes * l.quantite} /> : null}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {ouvert && chiffre ? (
          <details className="carte dv-annuler">
            <summary className="carte-titre-icone"><Icone nom="croix" /> Annuler ce devis</summary>
            <form action={action} method="post" className="dv-annuler-form">
              <input type="hidden" name="action" value="annuler" />
              <div className="champ">
                <label htmlFor="dv-motif">Pourquoi <span className="discret">(le client le lira)</span></label>
                <input id="dv-motif" name="motif" maxLength={300} required placeholder="Ex. Article plus fabriqué, remplacé par un autre modèle" />
              </div>
              <button className="btn btn-danger">Annuler le devis</button>
            </form>
          </details>
        ) : null}

        {d.motif && (d.statut === "annule" || d.statut === "refuse") ? (
          <p className="message">{d.statut === "refuse" ? "Le client l'a refusé" : "Annulé"} : {d.motif}</p>
        ) : null}

        {d.journal.length > 0 ? (
          <section className="carte" aria-labelledby="t-journal">
            <h2 id="t-journal" className="carte-titre-icone"><Icone nom="journal" /> Journal</h2>
            <ol className="bo-journal mt-3">
              {d.journal.map((j, i) => (
                <li key={`${j.le}-${i}`}>
                  <span className="bo-journal-point" aria-hidden="true" />
                  <span className="bo-journal-texte">
                    {j.action === "devis.envoyer" ? `Envoyé : ${formateMontant(j.apres?.total ?? 0)} TND` : `Annulé${j.apres?.motif ? ` — ${j.apres.motif}` : ""}`}
                  </span>
                  <span className="bo-journal-meta">{j.auteur ?? "SkanEcom"} · {quand(j.le, maintenant)}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </>
  );
}
