# Pose le lot M4 (les fournisseurs, essayés) — après M5, M2, M3, M6.
import os, shutil
S = os.path.dirname(os.path.abspath(__file__))
R = os.path.abspath(os.path.join(S, "..", "..", ".."))
A = f"{R}/application/src"

def copie(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy(src, dst)

copie(f"{S}/20260929121000_fournisseurs.sql", f"{R}/supabase/migrations/20260929121000_fournisseurs.sql")
copie(f"{S}/127_fournisseurs.sql", f"{R}/supabase/tests/127_fournisseurs.sql")
for racine, _, fichiers in os.walk(f"{S}/src"):
    for f in fichiers:
        src = os.path.join(racine, f)
        copie(src, src.replace(f"{S}/src", A))

def edite(chemin, avant, apres, base=A):
    p = f"{base}/{chemin}"
    s = open(p).read()
    assert avant in s, f"{chemin} : introuvable\n{avant[:160]}"
    open(p, "w").write(s.replace(avant, apres, 1))

# 1. Konnect : l'API répond-elle ? (sans clé : la plateforme n'en a pas, chaque boutique a la sienne)
edite("lib/paiement/konnect.ts", "async function appel(mode: ModeKonnect, cle: string, chemin: string,",
      """/** L'API de Konnect répond-elle ? Sans clé, elle refuse : c'est la réponse attendue (État technique → Fournisseurs). */
export async function joindreKonnect(): Promise<{ statut: number | null; duree: number; raison: string | null }> {
  const debut = Date.now();
  try {
    const r = await fetch(`${base("reel")}/payments/000000000000000000000000`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    await r.body?.cancel().catch(() => {});
    return { statut: r.status, duree: Date.now() - debut, raison: null };
  } catch (e) {
    const nom = (e as { name?: string })?.name;
    return { statut: null, duree: Date.now() - debut, raison: nom === "TimeoutError" || nom === "AbortError" ? "Pas de réponse en 8 secondes" : "Injoignable" };
  }
}

async function appel(mode: ModeKonnect, cle: string, chemin: string,""")

# 2. Le passage de l'heure essaie aussi les fournisseurs.
edite("lib/console/surveillance.ts", 'import { viderFiles } from "./taches";\n', 'import { viderFiles } from "./taches";\nimport { essayerFournisseurs } from "./fournisseurs";\n')
edite("lib/console/surveillance.ts", """    try { await viderFiles("heure"); } catch { /* la vérification passe quand même */ }
""", """    try { await viderFiles("heure"); } catch { /* la vérification passe quand même */ }
    try { await essayerFournisseurs(); } catch { /* idem */ }
""")

# 3. L'État technique : la carte « Fournisseurs », après les tâches de fond.
et = "app/%5Fconsole/(protegee)/etat/page.tsx"
edite(et, 'import { FichesReflexes } from "@/components/console/Reflexes";',
      'import { FichesReflexes } from "@/components/console/Reflexes";\nimport { CarteFournisseurs, pointsFournisseurs, type DonneesFournisseurs } from "@/components/console/Fournisseurs";')
edite(et, "{ data: dataTaches, error: errTaches }] = await Promise.all([", "{ data: dataTaches, error: errTaches }, { data: dataFourn }] = await Promise.all([")
edite(et, '    service.rpc("console_taches", { p_acteur: user.id }),\n  ]);',
      '    service.rpc("console_taches", { p_acteur: user.id }),\n    service.rpc("console_fournisseurs", { p_acteur: user.id }),\n  ]);')
edite(et, "  const taches = dataTaches as DonneesTaches;\n",
      "  const taches = dataTaches as DonneesTaches;\n  const fournisseurs = (dataFourn ?? {}) as DonneesFournisseurs;\n")
edite(et, '{ id: "taches", titre: "Tâches de fond", points: pointsTaches(taches, maintenant) },',
      '{ id: "taches", titre: "Tâches de fond", points: pointsTaches(taches, maintenant) }, { id: "fournisseurs", titre: "Fournisseurs", points: pointsFournisseurs(fournisseurs) },')
edite(et, '        <CarteTaches d={taches} maintenant={maintenant} superAdmin={superAdmin} message={message("taches")} />\n',
      '        <CarteTaches d={taches} maintenant={maintenant} superAdmin={superAdmin} message={message("taches")} />\n\n'
      '        <CarteFournisseurs d={fournisseurs} maintenant={maintenant} message={message("fournisseurs")} />\n')

# 4. Le journal.
edite("lib/console/journal.ts", '  "plateforme.taches_lancees": "Tâches de fond lancées à la main",\n',
      '  "plateforme.taches_lancees": "Tâches de fond lancées à la main",\n  "plateforme.fournisseurs_essayes": "Fournisseurs essayés à la main",\n')

# 5. Les styles.
c = f"{A}/app/%5Fconsole/console.css"
s = open(c).read().rstrip("\n")
s += """

/* ---- Les fournisseurs (État technique) ---- */
.fo-liste { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.fo-liste > li { display: grid; grid-template-columns: minmax(11rem, 15rem) minmax(0, 1fr) auto; align-items: center; gap: .25rem 1.25rem; padding: .625rem 0; border-block-end: 1px solid var(--ui-bord-leger); font-size: .875rem; }
.fo-liste > li:last-child { border-block-end: 0; }
.fo-nom, .fo-essai { display: grid; gap: .125rem; min-inline-size: 0; overflow-wrap: anywhere; }
.fo-etat { justify-self: end; }
@media (max-width: 48rem) {
  .fo-liste > li { grid-template-columns: minmax(0, 1fr) auto; }
  .fo-essai { grid-column: 1 / -1; grid-row: 2; }
  .fo-etat { grid-column: 2; grid-row: 1; }
}
"""
open(c, "w").write(s + "\n")
print("M4 posé")

# 6. Le parcours de la console et la documentation.
edite("application/essais/parcours-console.mjs",
      '''await etape("les revenus : sans prix fixé, rien n'est compté ; les démonstrations n'y sont pas", async () => {''',
      '''await etape("les fournisseurs : un appel inoffensif à chacun, ce qu'il répond", async () => {
  await page.goto(`${CONSOLE}/etat#t-fournisseurs`, { waitUntil: "networkidle" });
  const carte = page.locator('section[aria-labelledby="t-fournisseurs"]');
  await clic(page, carte.getByRole("button", { name: "Essayer maintenant" }));
  await page.waitForFunction(() => /^Essayés/.test(document.querySelector('section[aria-labelledby="t-fournisseurs"] .message')?.textContent ?? ""), null, { timeout: 60000 });
  const texte = await carte.innerText();
  verifie(/E-mails[\\s\\S]*répond en/.test(texte), "les e-mails : le fournisseur (ici simulé) répond, en combien de temps");
  verifie(["SMS", "SkanFact", "Konnect", "Cloudflare"].every((x) => texte.includes(x)), "et chaque autre fournisseur, avec son mode");
  await capture(page, "console-fournisseurs", true);
});

await etape("les revenus : sans prix fixé, rien n'est compté ; les démonstrations n'y sont pas", async () => {''', base=R)
def apres(chemin, ancre, texte):
    p = f"{R}/{chemin}"; s = open(p).read(); i = s.index(ancre); j = s.index("\n", i)
    open(p, "w").write(s[:j + 1] + texte + s[j + 1:])
apres("docs/FEUILLE-DE-ROUTE.md", "- [x] **Le diagnostic d'une boutique, et les fiches réflexes**",
      "- [x] **Les fournisseurs, essayés** (12/10, migration …_fournisseurs ; pgTAP 127 : 9 tests) : l'État technique disait si un secret est posé, pas si le fournisseur l'accepte encore. Chaque heure et à la demande, un appel inoffensif à chacun — e-mails (Resend, Brevo), SMS (Twilio), SkanFact, Konnect, Cloudflare — : répond-il, en combien de temps, sinon pourquoi (clé refusée, injoignable), et depuis quand. État technique → **Fournisseurs** ; un fournisseur d'e-mails en panne passe au verdict en rouge. En local, les simulateurs du relais répondent.\n")
apres("docs/TESTER.md", "**Le diagnostic** (console, fiche d'une boutique",
      "\n**Les fournisseurs** (console, **État technique** → Fournisseurs) — **Essayer maintenant** : chacun répond-il, accepte-t-il notre clé ? Utile juste après avoir changé un secret.\n")
print("M4 : parcours et documentation posés")
