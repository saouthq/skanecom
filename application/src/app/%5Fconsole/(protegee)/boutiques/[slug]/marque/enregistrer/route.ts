import { clientService } from "@/lib/console/service";
import { ecriture, messageBase, vers, versAvecErreur } from "@/lib/console/http";
import { JETONS_COULEUR, POLICES_TEXTE, structureDe, themeDeLaBoutique, type Structure } from "@/lib/theme";
import { TEXTES_MARQUE } from "../champs";

/* Construit le thème à partir du formulaire : seules les couleurs qui
   diffèrent du thème de départ sont gardées, les textes vides sont retirés,
   les textes que ce formulaire ne connaît pas sont conservés tels quels. La
   base valide le tout (private.valide_theme) et trace l'enregistrement. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const retour = `/boutiques/${slug}/marque`;
  return ecriture(req, async ({ user, formulaire, ip }) => {
    const service = clientService(ip);
    const { data: fiche, error: lecture } = await service.rpc("console_boutique", { p_slug: slug });
    if (lecture || !fiche?.theme) return versAvecErreur(retour, messageBase(lecture));

    // Le formulaire choisit une des six structures (l'éditeur Apparence du
    // back-office fait de même) ; sans choix, la boutique garde la sienne.
    const code: Structure = structureDe(formulaire.get("code") ?? fiche.theme.code);
    const defauts = themeDeLaBoutique({ code });

    const couleurs: Record<string, string> = {};
    for (const j of JETONS_COULEUR) {
      const v = String(formulaire.get(`couleur.${j}`) ?? "").trim().toUpperCase();
      if (v && v !== defauts.couleurs[j].toUpperCase()) couleurs[j] = v;
    }

    const titres = String(formulaire.get("polices_titres") ?? "");
    const texte = String(formulaire.get("polices_texte") ?? "");
    const polices = {
      ...(titres && titres !== defauts.polices.titres ? { titres } : {}),
      ...(texte && texte !== defauts.polices.texte && (POLICES_TEXTE as string[]).includes(texte) ? { texte } : {}),
    };

    const textes: Record<string, string> = { ...(fiche.theme.textes ?? {}) };
    for (const { cle } of TEXTES_MARQUE) {
      const v = String(formulaire.get(`texte.${cle}`) ?? "").trim();
      if (v) textes[cle] = v;
      else delete textes[cle];
    }

    const theme: Record<string, unknown> = { code, couleurs, polices, textes };
    const logoMode = formulaire.get("logo_mode");
    if (logoMode === "masque" || logoMode === "image") theme.logo_mode = logoMode;

    const { data: version, error } = await service.rpc("console_modifier_theme", {
      p_acteur: user.id,
      p_boutique_id: String(formulaire.get("boutique_id") ?? ""),
      p_version: Number(formulaire.get("version") ?? 0),
      p_theme: theme,
    });
    if (error) return versAvecErreur(retour, messageBase(error));
    return vers(`${retour}?${new URLSearchParams({ ok: `Marque enregistrée (version ${version}).` })}`);
  });
}
