import { AccueilEditorial } from "./AccueilEditorial";
import { AvisProduit, ResumeAvis } from "./AvisProduit";
import { GalerieEditoriale } from "./Galerie";
import { FournisseurSelection } from "./SelectionVariante";
import { VenteMonoproduit } from "./VenteMonoproduit";
import { rassurances } from "./Rassurances";
import { Coche } from "./Icones";
import type { Cadre } from "@/lib/boutique";
import type { DonneesAccueil } from "@/lib/accueil";
import { prixDepuis, type Produit } from "@/lib/catalogue";
import { formatePrix } from "@/lib/prix";
import { verificationDe } from "@/lib/connexion";
import { identiteLegale } from "@/lib/legal";
import { photosProduit } from "@/lib/photos";
import { texte, type Section } from "@/lib/theme";
import { champ, t } from "@/lib/i18n";

/* ============================================================================
   L'ACCUEIL MONOPRODUIT — la boutique qui vend surtout une pièce, par la
   publicité : l'accueil devient sa page de vente.

   La section « piece » en est le cœur : les photos du produit, la promesse
   de la boutique (ses lignes « - … » deviennent des points cochés), sa
   note, les offres par quantité en grandes cartes, la commande sur la page
   même ; ses avis, avec leurs filtres, prennent la place de la section
   « avis ». Les autres sections (récit, questions, engagements…) sont
   celles du gabarit éditorial, comme la fiche, le catalogue et le tunnel.
   Préfixe pv- (page de vente).
   ========================================================================== */

type Props = { cadre: Cadre; donnees: DonneesAccueil };

export function AccueilMonoproduit({ cadre, donnees }: Props) {
  const [rangVente, vendu] = [...donnees.pieces.entries()][0] ?? [null, null];
  return (
    <>
    {/* Sans section « piece », la page de vente se pose en tête. */}
    {rangVente === -1 && vendu ? (
      <PageVente rang={-1} section={{ type: "piece", textes: {} }} produit={vendu} cadre={cadre} donnees={donnees} premiere />
    ) : null}
    <AccueilEditorial
      cadre={cadre}
      donnees={donnees}
      propre={(s, i) => {
        if (s.type === "piece") {
          return i === rangVente && vendu ? <PageVente key={i} rang={i} section={s} produit={vendu} cadre={cadre} donnees={donnees} premiere={i === 0} /> : null;
        }
        // Les avis de la page : ceux du produit vendu, comme sur sa fiche.
        if (s.type === "avis" && vendu) {
          const avis = donnees.vente?.avis ?? null;
          return avis && avis.total > 0 ? (
            <div key={i} data-section={i}>
              <AvisProduit avis={avis} produitId={vendu.id} section="enveloppe ed-section pv-avis" tete="ed-section-tete"
                titre={texte(s.textes, "titre", t.avis.titre)} />
            </div>
          ) : null;
        }
        return undefined;
      }}
    />
    {vendu ? <Rappel produit={vendu} cod={cadre.livraison.cod} /> : null}
    </>
  );
}

/** Au bas de la page, après les avis et les questions : une dernière fois le produit et « Commander ». */
function Rappel({ produit, cod }: { produit: Produit; cod: boolean }) {
  const prix = prixDepuis(produit);
  return (
    <section className="enveloppe pv-rappel" aria-labelledby="pv-rappel-titre">
      <div className="pv-rappel-corps">
        <h2 id="pv-rappel-titre">{champ(produit, "nom")}</h2>
        {prix !== null ? <p>{t.vente.rappel(formatePrix(prix), cod)}</p> : null}
        <a className="btn btn-primaire" href="#commande">{t.vente.commander}</a>
      </div>
    </section>
  );
}

function PageVente({ rang, section, produit, cadre, donnees, premiere }: {
  rang: number;
  section: Extract<Section, { type: "piece" }>;
  produit: Produit;
  cadre: Cadre;
  donnees: DonneesAccueil;
  premiere: boolean;
}) {
  const nom = champ(produit, "nom");
  const etiquette = texte(section.textes, "etiquette") || produit.marque || "";
  const titre = texte(section.textes, "titre", nom);
  const promesse = texte(section.textes, "texte") || champ(produit, "description");
  const Titre = premiere ? "h1" : "h2";

  const tete = (
    <div className="pv-tete">
      {etiquette ? <p className="etiquette" key={etiquette} data-texte="etiquette">{etiquette}</p> : null}
      <Titre key={titre} data-texte="titre">{titre}</Titre>
      <ResumeAvis avis={donnees.vente?.avis ?? null} />
      {promesse ? <Promesse texte={promesse} /> : null}
    </div>
  );

  const assurances = (
    <ul className="ed-rassure pv-rassure">
      {rassurances(cadre).filter((r) => r.cle !== "rappel").slice(0, 3).map((r) => (
        <li key={r.cle}>
          {r.icone}
          <span>
            <b>{r.titre}</b> {r.texte}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="pv-vente" data-section={rang >= 0 ? rang : undefined} aria-label={nom}>
      <FournisseurSelection produit={produit}>
        <VenteMonoproduit
          produit={produit}
          galerie={<GalerieEditoriale photos={photosProduit(produit)} nom={nom} />}
          tete={tete}
          assurances={assurances}
          prixBarres={cadre.prixBarres}
          prevenirRetour={cadre.prevenirRetour}
          rappel={cadre.livraison.cod && cadre.livraison.rappel}
          tunnel={{
            gabarit: cadre.theme.code,
            boutiqueId: cadre.boutique.id,
            boutique: cadre.boutique.slug,
            compteObligatoire: cadre.reglages["compte.obligatoire"] !== false,
            verification: verificationDe(cadre.reglages),
            rappel: cadre.livraison.rappel,
            cod: cadre.livraison.cod,
            gouvernorats: donnees.vente?.gouvernorats ?? [],
            retractationJours: identiteLegale(cadre).retractationJours,
            retrait: cadre.retrait,
            codesPromo: cadre.promotions,
            relancePaniers: cadre.relancePaniers,
          }}
        />
      </FournisseurSelection>
    </section>
  );
}

/** La promesse : ses paragraphes, et ses lignes « - … » en points cochés. */
function Promesse({ texte: brut }: { texte: string }) {
  const blocs: ({ type: "p"; texte: string } | { type: "liste"; points: string[] })[] = [];
  for (const ligne of brut.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const point = /^[-–•·]\s+(.+)$/.exec(ligne)?.[1];
    const dernier = blocs[blocs.length - 1];
    if (point && dernier?.type === "liste") dernier.points.push(point);
    else if (point) blocs.push({ type: "liste", points: [point] });
    else blocs.push({ type: "p", texte: ligne });
  }
  // Un seul paragraphe s'écrit dans l'aperçu de l'éditeur ; des points, dans son panneau.
  if (blocs.length === 1 && blocs[0].type === "p") {
    return <p className="chapo pv-promesse" key={brut} data-texte="texte">{blocs[0].texte}</p>;
  }
  return (
    <div className="pv-promesse" key={brut}>
      {blocs.map((b, i) =>
        b.type === "p" ? (
          <p key={i} className="chapo">{b.texte}</p>
        ) : (
          <ul key={i} className="pv-points">
            {b.points.map((p) => (
              <li key={p}>
                <Coche taille={16} />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
