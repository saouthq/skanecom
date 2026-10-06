import { BoutonCopier } from "@/components/console/BoutonCopier";
import { Icone } from "@/components/console/Icone";
import type { Branchement, EnregistrementDns } from "@/lib/console/domaines-cloudflare";

/* Un domaine à lui, à brancher : ce que le commerçant pose chez son
   registrar (le CNAME qui mène la vitrine, le TXT qui prouve le domaine),
   où en est Cloudflare, et les gestes (brancher, relire). Sans branchement
   réglé chez Cloudflare : le CNAME seul, à poser à la main. */

const ETAT: Record<Branchement["statut"], { t: string; c: string }> = {
  actif: { t: "Branché", c: "ui-etat ui-etat-point ui-etat-vert" },
  a_poser: { t: "À poser chez le registrar", c: "ui-etat ui-etat-point ui-etat-ambre" },
  refuse: { t: "Refusé", c: "ui-etat ui-etat-point ui-etat-rouge" },
};

export function BranchementDomaine({ hote, slug, boutiqueId, branchement, cible, saas }: {
  hote: string; slug: string; boutiqueId: string; branchement: Branchement | null; cible: string | null; saas: boolean;
}) {
  const enregistrements: EnregistrementDns[] = branchement?.enregistrements
    ?? (cible ? [{ type: "CNAME", nom: hote, valeur: cible, role: "Mène la vitrine" }] : []);
  const etat = branchement ? ETAT[branchement.statut] : null;
  const racine = hote.startsWith("www.") ? hote.slice(4) : null;
  return (
    <div className="bt-branchement" data-statut={branchement?.statut ?? "a_brancher"}>
      <div className="bt-branchement-tete">
        <p><b>{hote}</b></p>
        {etat ? <span className={etat.c}>{etat.t}</span> : <span className="ui-etat ui-etat-point ui-etat-ambre">À brancher</span>}
      </div>
      {branchement?.statut === "actif" ? (
        <p className="aide">La vitrine s&apos;ouvre à cette adresse, son certificat est émis.</p>
      ) : (
        <>
          <p className="aide">
            {enregistrements.length
              ? <>À poser dans la zone DNS de {racine ?? hote} (chez son registrar, ou chez Cloudflare s&apos;il y a été acheté), tels quels.{racine ? <> Et à la racine (<b>{racine}</b>) : une redirection vers <b>{hote}</b>, que la plupart des registrars proposent.</> : null}</>
              : "La cible de la plateforme (NEXT_PUBLIC_CIBLE_DNS) n'est pas réglée : rien à poser encore."}
          </p>
          {enregistrements.length ? (
            <div className="ce-dns-cadre">
              <table className="ce-dns">
                <thead><tr><th>Type</th><th>Nom</th><th>Valeur</th></tr></thead>
                <tbody>
                  {enregistrements.map((e) => (
                    <tr key={`${e.type}-${e.nom}`}>
                      <td data-titre="Type"><span className="ce-type">{e.type}</span><span className="ce-role">{e.role}</span></td>
                      <td data-titre="Nom">
                        <code className="ce-code">{e.nom}</code>
                        <BoutonCopier texte={e.nom} libelle="Copier" classe="btn btn-fantome btn-petit ce-copier" />
                      </td>
                      <td data-titre="Valeur">
                        <code className="ce-code ce-valeur">{e.valeur}</code>
                        <BoutonCopier texte={e.valeur} libelle="Copier" classe="btn btn-fantome btn-petit ce-copier" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {branchement?.erreurs.length ? <p className="aide et-manque">{branchement.erreurs[0]}</p> : null}
        </>
      )}
      {saas ? (
        <form action={`/boutiques/${slug}/domaines`} method="post" className="bt-branchement-gestes">
          <input type="hidden" name="boutique_id" value={boutiqueId} />
          <input type="hidden" name="hote" value={hote} />
          {branchement ? (
            <button type="submit" name="geste" value="relire" className="btn btn-second btn-petit"><Icone nom="horloge" taille={14} /> Relire chez Cloudflare</button>
          ) : (
            <button type="submit" name="geste" value="brancher" className="btn btn-second btn-petit"><Icone nom="lien" taille={14} /> Brancher chez Cloudflare</button>
          )}
        </form>
      ) : (
        <p className="aide">Le branchement chez Cloudflare n&apos;est pas réglé sur la plateforme (secret CLOUDFLARE_DOMAINES) : le certificat se règle à la main.</p>
      )}
    </div>
  );
}
