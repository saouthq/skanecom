import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { EnTetePage } from "@/components/console/Coquille";
import { Icone } from "@/components/console/Icone";
import { clientSession, exigeMembre } from "@/lib/console/session";
import { PEUT_STOCKER } from "@/lib/gestion/catalogue";
import { jourArrivage, joursAvant, type Arrivage, type EcranArrivages } from "@/lib/gestion/arrivages";
import { quand } from "@/lib/gestion/libelles";

export const metadata: Metadata = { title: "Arrivages" };

/* ============================================================================
   LES ARRIVAGES ANNONCÉS — Catalogue → Arrivages : le conteneur commandé au
   fournisseur, avant qu'il n'arrive. Son nom, sa date prévue, ce qu'il
   apporte. Avec le réglage « Précommandes sur arrivage », ses déclinaisons
   épuisées se précommandent sur la vitrine, dans la limite de ce qu'il
   apporte ; la commande attend, elle ne part pas.

   À la réception (les quantités vraiment reçues, celles annoncées d'abord),
   tout passe au journal du stock et les précommandes sont servies d'abord,
   dans l'ordre des commandes : elles passent « À préparer ». Un arrivage
   qui ne viendra pas s'annule ; ce qui y était précommandé attend le
   prochain stock, l'équipe prévient les clients.

   Propriétaire, administrateur, préparation ; la base revérifie
   (…_precommandes.sql, migration 88).
   ========================================================================== */

export default async function Arrivages({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; erreur?: string }>;
}) {
  const [{ slug }, messages] = await Promise.all([params, searchParams]);
  const { boutique } = await exigeMembre(slug);
  const catalogue = `/gestion/${slug}/produits`;
  if (!PEUT_STOCKER.includes(boutique.role)) redirect(catalogue);
  const sb = await clientSession();
  const { data, error } = await sb.rpc("gestion_arrivages", { p_boutique_id: boutique.boutique_id });
  if (error) throw new Error(`Arrivages illisibles : ${error.message}`);
  const ecran = data as EcranArrivages;
  const base = `${catalogue}/arrivages`;
  const action = `${base}/action`;
  const attendus = ecran.arrivages.filter((a) => a.statut === "attendu");
  const passes = ecran.arrivages.filter((a) => a.statut !== "attendu");
  const maintenant = new Date();

  return (
    <>
      <EnTetePage
        avant={<Link href={catalogue}><Icone nom="retour" taille={14} /> Catalogue</Link>}
        titre="Arrivages"
        description="Le conteneur commandé, avant qu'il n'arrive : ce qu'il apporte et quand. Ses pièces épuisées se précommandent sur la vitrine ; à la réception, les précommandes sont servies d'abord."
        actions={<Link href={`${base}/nouveau`} className="btn btn-primaire"><Icone nom="calendrier" /> Annoncer un arrivage</Link>}
      />
      <div className="pile">
        {messages.ok ? <p className="message message-succes" role="status">{messages.ok}</p> : null}
        {messages.erreur ? <p className="message message-erreur" role="alert">{messages.erreur}</p> : null}
        {!ecran.actif ? (
          <p className="message ar-coupe">
            Les précommandes sont coupées : la vitrine ne propose rien de ces arrivages. Ils servent quand même à préparer la réception.{" "}
            {boutique.role === "proprietaire" || boutique.role === "admin" ? (
              <Link href={`/gestion/${slug}/reglages#vitrine`}>Allumer « Précommandes sur arrivage »</Link>
            ) : null}
          </p>
        ) : null}
        {ecran.en_attente > 0 ? (
          <p className="message ar-attente">
            <span>
              <b>{ecran.en_attente}</b> commande{ecran.en_attente > 1 ? "s attendent" : " attend"} un arrivage.{" "}
              <Link href={`/gestion/${slug}?etape=precommandes`}>Voir les précommandes</Link>
            </span>
          </p>
        ) : null}

        <section aria-labelledby="t-attendus" className="pm-section">
          <h2 id="t-attendus" className="pm-titre">Attendus <span className="compte-onglet">{attendus.length}</span></h2>
          {attendus.length === 0 ? (
            <div className="vide bo-vide">
              <span className="vide-icone"><Icone nom="calendrier" taille={20} /></span>
              <strong>Aucun arrivage annoncé</strong>
              <p>Annoncez le prochain conteneur : ses pièces épuisées se précommandent dès l&apos;annonce, la réception sera prête à remplir.</p>
            </div>
          ) : (
            <ul className="pm-liste ar-liste" role="list">
              {attendus.map((a) => <CarteArrivage key={a.id} a={a} base={base} action={action} maintenant={maintenant} />)}
            </ul>
          )}
        </section>

        {passes.length > 0 ? (
          <section aria-labelledby="t-passes" className="pm-section">
            <h2 id="t-passes" className="pm-titre">Reçus et annulés, ces 60 derniers jours <span className="compte-onglet">{passes.length}</span></h2>
            <ul className="pm-liste ar-liste" role="list">
              {passes.map((a) => <CarteArrivage key={a.id} a={a} base={base} action={action} maintenant={maintenant} />)}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}

/** Un arrivage : sa date, ce qu'il apporte, ce qui en est précommandé, ses gestes. */
function CarteArrivage({ a, base, action, maintenant }: { a: Arrivage; base: string; action: string; maintenant: Date }) {
  const attendu = a.statut === "attendu";
  const dans = joursAvant(a.date_prevue, maintenant);
  const pieces = a.lignes.reduce((s, l) => s + l.quantite, 0);
  const precommandees = a.lignes.reduce((s, l) => s + l.precommandees, 0);
  const etat = !attendu
    ? a.statut === "recu" ? `Reçu ${a.recu_le ? quand(a.recu_le, maintenant) : ""}` : "Annulé"
    : dans > 1 ? `Dans ${dans} jours` : dans === 1 ? "Demain" : dans === 0 ? "Aujourd'hui" : `En retard de ${-dans} jour${dans < -1 ? "s" : ""}`;
  return (
    <li className="carte pm-carte ar-carte" data-etat={attendu ? (dans < 0 ? "retard" : "attendu") : a.statut} id={`arrivage-${a.id}`}>
      <div className="pm-tete">
        <h3 className="ar-nom">{a.nom}</h3>
        <span className={attendu ? (dans < 0 ? "ui-etat ui-etat-point ui-etat-ambre" : "ui-etat ui-etat-point ui-etat-bleu") : a.statut === "recu" ? "ui-etat ui-etat-point ui-etat-vert" : "ui-etat"}>{etat}</span>
      </div>
      <p className="ar-date"><Icone nom="calendrier" taille={15} /> Prévu le {jourArrivage(a.date_prevue)}</p>
      {a.note ? <p className="pm-conditions">{a.note}</p> : null}
      <ul className="ar-lignes" role="list" aria-label="Ce qu'il apporte">
        {a.lignes.map((l) => (
          <li key={l.variante_id} className="ar-ligne">
            <span className="ar-quoi">
              <b>{l.produit}</b>
              <span className="discret">{[l.libelle, l.sku].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="ar-chiffres tabular-nums">
              <span>{l.quantite} attendue{l.quantite > 1 ? "s" : ""}</span>
              {l.precommandees > 0 ? <span className="ar-pre">{l.precommandees} précommandée{l.precommandees > 1 ? "s" : ""}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <div className="pm-chiffres">
        <p>
          <span className="ligne-points">
            <span><b className="tabular-nums">{pieces}</b> pièce{pieces > 1 ? "s" : ""}</span>
            {precommandees > 0 ? (
              <span><b className="tabular-nums">{precommandees}</b> précommandée{precommandees > 1 ? "s" : ""} par <b className="tabular-nums">{a.commandes}</b> commande{a.commandes > 1 ? "s" : ""}</span>
            ) : attendu ? <span>Rien de précommandé pour le moment</span> : null}
          </span>
        </p>
      </div>

      {attendu ? (
        <div className="pm-gestes">
          <details className="pm-pli ar-pli">
            <summary className="btn btn-primaire"><Icone nom="colis" taille={15} /> Réceptionner</summary>
            <form method="post" action={action} className="ar-recevoir">
              <input type="hidden" name="geste" value="recevoir" />
              <input type="hidden" name="arrivage_id" value={a.id} />
              <p className="aide">Les quantités vraiment reçues (celles annoncées d&apos;abord) : tout passe au journal du stock, les précommandes sont servies d&apos;abord.</p>
              <ul className="rc-lignes" role="list">
                {a.lignes.map((l) => (
                  <li key={l.variante_id} className="rc-ligne">
                    <label htmlFor={`r-${a.id}-${l.variante_id}`} className="rc-quoi">
                      <b>{l.produit}</b>
                      <span className="discret tabular-nums">{[l.libelle, l.sku].filter(Boolean).join(" · ")}</span>
                    </label>
                    <span className="rc-stock tabular-nums">
                      {l.quantite} annoncée{l.quantite > 1 ? "s" : ""}
                      {l.precommandees > 0 ? <span className="ar-pre"> · {l.precommandees} à servir</span> : null}
                    </span>
                    <input id={`r-${a.id}-${l.variante_id}`} name={`q:${l.variante_id}`} className="entree rc-quantite tabular-nums"
                           inputMode="numeric" autoComplete="off" defaultValue={l.quantite} pattern="\d{0,6}"
                           aria-label={`Quantité reçue : ${l.produit}${l.libelle ? `, ${l.libelle}` : ""}`} />
                  </li>
                ))}
              </ul>
              <button type="submit" className="btn btn-primaire"><Icone nom="colis" taille={15} /> Enregistrer la réception</button>
            </form>
          </details>
          <Link href={`${base}/${a.id}`} className="btn btn-second"><Icone nom="crayon" taille={14} /> Changer</Link>
          <details className="pm-pli ar-pli">
            <summary className="btn btn-second">Annuler l&apos;arrivage</summary>
            <form method="post" action={action} className="ar-annuler">
              <input type="hidden" name="geste" value="annuler" />
              <input type="hidden" name="arrivage_id" value={a.id} />
              <p className="aide">
                {a.commandes > 0
                  ? `${a.commandes} commande${a.commandes > 1 ? "s l'attendent" : " l'attend"} : elle${a.commandes > 1 ? "s" : ""} attendr${a.commandes > 1 ? "ont" : "a"} le prochain stock. Prévenez les clients, ou annulez leur commande.`
                  : "Plus rien ne s'y précommandera. Rien n'est encore précommandé."}
              </p>
              <button type="submit" className="btn btn-danger">Oui, il ne viendra pas</button>
            </form>
          </details>
        </div>
      ) : null}
    </li>
  );
}
