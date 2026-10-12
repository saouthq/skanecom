# Pose le lot M6 (diagnostic d'une boutique, fiches réflexes) — après M5, M2 et M3.
import os, shutil
S = os.path.dirname(os.path.abspath(__file__))
R = os.path.abspath(os.path.join(S, "..", "..", ".."))
A = f"{R}/application/src"

def copie(src, dst):
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy(src, dst)

copie(f"{S}/20260929120900_diagnostic.sql", f"{R}/supabase/migrations/20260929120900_diagnostic.sql")
copie(f"{S}/126_diagnostic.sql", f"{R}/supabase/tests/126_diagnostic.sql")
for racine, _, fichiers in os.walk(f"{S}/src"):
    for f in fichiers:
        src = os.path.join(racine, f)
        copie(src, src.replace(f"{S}/src", A))

def edite(chemin, avant, apres, base=A):
    p = f"{base}/{chemin}"
    s = open(p).read()
    assert avant in s, f"{chemin} : introuvable\n{avant[:160]}"
    open(p, "w").write(s.replace(avant, apres, 1))

# 1. La surveillance prête son essai d'une vitrine au diagnostic.
edite("lib/console/surveillance.ts", "async function verifierPage(h: AVerifier[\"hotes\"][number]): Promise<Releve | null> {",
      """/** Essayer une vitrine à l'instant, comme le passage de l'heure (le diagnostic d'une boutique). */
export function essayerVitrine(hote: string, boutiqueId: string): Promise<Releve | null> {
  return verifierPage({ hote, boutique_id: boutiqueId, principal: true });
}

async function verifierPage(h: AVerifier["hotes"][number]): Promise<Releve | null> {""")

# 2. L'onglet « Diagnostic » de la fiche.
edite("app/%5Fconsole/(protegee)/boutiques/[slug]/layout.tsx",
      '          { href: `${base}/support`, libelle: "Support", icone: "support" },\n',
      '          { href: `${base}/support`, libelle: "Support", icone: "support" },\n'
      '          { href: `${base}/diagnostic`, libelle: "Diagnostic", icone: "jauge" },\n')

# 3. Le dépannage de la fiche mène au diagnostic.
edite("components/console/Depannage.tsx",
      "          <p>Quand sa vitrine casse : la mettre en pause derrière une page d&apos;attente, vider son cache, relancer ses envois coincés.</p>",
      "          <p>Quand sa vitrine casse : la mettre en pause derrière une page d&apos;attente, vider son cache, relancer ses envois coincés.\n"
      "            {\" \"}<Link href={`/boutiques/${b.slug}/diagnostic`}>Son diagnostic</Link> dit d&apos;abord ce qui bloque.</p>")

# 4. L'État technique : les fiches réflexes, en dernier.
et = "app/%5Fconsole/(protegee)/etat/page.tsx"
edite(et, 'import { CarteTaches, pointsTaches, type DonneesTaches } from "@/components/console/Taches";',
      'import { CarteTaches, pointsTaches, type DonneesTaches } from "@/components/console/Taches";\nimport { FichesReflexes } from "@/components/console/Reflexes";')
edite(et, "          boutiques={toutes.filter((b) => b.statut !== \"fermee\").map((b) => ({ slug: b.slug, nom: b.nom, demonstration: b.demonstration }))} />\n      </div>",
      "          boutiques={toutes.filter((b) => b.statut !== \"fermee\").map((b) => ({ slug: b.slug, nom: b.nom, demonstration: b.demonstration }))} />\n\n        <FichesReflexes />\n      </div>")

# 5. Les styles.
c = f"{A}/app/%5Fconsole/console.css"
s = open(c).read().rstrip("\n")
s += """

/* ---- Le diagnostic d'une boutique ---- */
.dg { display: grid; gap: 1rem; }
.dg-liste { display: grid; gap: 0; margin: 0; padding: .25rem 1.25rem; list-style: none; }
.dg-liste > li { display: grid; grid-template-columns: 1.75rem minmax(0, 1fr) auto; align-items: start; gap: .25rem .875rem; padding: .875rem 0; border-block-end: 1px solid var(--ui-bord-leger); }
.dg-liste > li:last-child { border-block-end: 0; }
.dg-marque { display: grid; place-items: center; inline-size: 1.75rem; block-size: 1.75rem; border-radius: 999px; background: var(--ui-survol); color: var(--ui-texte-3); }
.dg-liste > li[data-niveau="ok"] .dg-marque { color: var(--ui-vert, #15803D); background: var(--ui-vert-fond, #F0FDF4); }
.dg-liste > li[data-niveau="attention"] .dg-marque { color: var(--ui-ambre); background: var(--ui-ambre-fond); }
.dg-liste > li[data-niveau="panne"] .dg-marque { color: var(--ui-rouge); background: var(--ui-rouge-fond); }
.dg-corps { min-inline-size: 0; display: grid; gap: .25rem; }
.dg-titre, .dg-vu, .dg-faire { margin: 0; overflow-wrap: anywhere; }
.dg-titre { font-size: .9375rem; }
.dg-mot { margin-inline-start: .375rem; font-size: .6875rem; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--ui-texte-3); }
.dg-liste > li[data-niveau="panne"] .dg-mot { color: var(--ui-rouge); }
.dg-liste > li[data-niveau="attention"] .dg-mot { color: var(--ui-ambre); }
.dg-vu { font-size: .875rem; color: var(--ui-texte-2); }
.dg-lien { align-self: center; }
@media (max-width: 40rem) {
  .dg-liste { padding-inline: 1rem; }
  .dg-liste > li { grid-template-columns: 1.75rem minmax(0, 1fr); }
  .dg-lien { grid-column: 2; justify-self: start; }
}

/* ---- Les fiches réflexes (État technique) ---- */
.rf-liste { display: grid; gap: .5rem; }
.rf { border: 1px solid var(--ui-bord-leger); border-radius: var(--ui-r); background: var(--ui-panneau); }
.rf > summary { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .75rem .875rem; cursor: pointer; list-style: none; font-size: .875rem; font-weight: 600; }
.rf > summary::-webkit-details-marker { display: none; }
.rf > summary:focus-visible { outline: 2px solid var(--ui-accent, #2563EB); outline-offset: 2px; border-radius: var(--ui-r); }
.rf > summary svg { flex: none; transition: transform .2s ease; color: var(--ui-texte-3); }
.rf[open] > summary svg { transform: rotate(180deg); }
.rf > ol { margin: 0; padding: 0 .875rem .875rem 2.25rem; display: grid; gap: .5rem; font-size: .875rem; color: var(--ui-texte-2); }
.rf > ol code { font-size: .8125rem; overflow-wrap: anywhere; }
@media (prefers-reduced-motion: reduce) { .rf > summary svg { transition: none; } }
"""
open(c, "w").write(s + "\n")
print("M6 posé")

# 6. Le parcours de la console et la documentation.
edite("application/essais/parcours-console.mjs",
      '''await etape("les revenus : sans prix fixé, rien n'est compté ; les démonstrations n'y sont pas", async () => {''',
      '''await etape("le diagnostic d'une boutique, et les fiches réflexes de l'État technique", async () => {
  await page.goto(`${CONSOLE}/boutiques/maymar`, { waitUntil: "networkidle" });
  await clic(page, page.locator(".onglets").getByRole("link", { name: "Diagnostic" }));
  await page.waitForURL(/\\/boutiques\\/maymar\\/diagnostic$/);
  const liste = await page.locator(".dg-liste").innerText();
  verifie(/maymar\\.localhost répond 200/.test(liste), "la vitrine essayée à l'instant : elle répond");
  verifie(["Son statut", "Son catalogue", "Sa livraison", "Ses commandes"].every((x) => liste.includes(x)), "chaque point de la vente, avec ce qu'il a vu");
  await capture(page, "console-diagnostic", true);
  await page.goto(`${CONSOLE}/etat#t-reflexes`, { waitUntil: "networkidle" });
  const fiche = page.locator('section[aria-labelledby="t-reflexes"] details.rf').first();
  await clic(page, fiche.locator("summary"));
  verifie(await fiche.evaluate((d) => d.open), "une fiche réflexe s'ouvre : les gestes dans l'ordre, avec leurs liens");
});

await etape("les revenus : sans prix fixé, rien n'est compté ; les démonstrations n'y sont pas", async () => {''', base=R)
def apres(chemin, ancre, texte):
    p = f"{R}/{chemin}"; s = open(p).read(); i = s.index(ancre); j = s.index("\n", i)
    open(p, "w").write(s[:j + 1] + texte + s[j + 1:])
apres("docs/FEUILLE-DE-ROUTE.md", "- [x] **Les tâches de fond**",
      "- [x] **Le diagnostic d'une boutique, et les fiches réflexes** (12/10, migration …_diagnostic ; pgTAP 126 : 9 tests) : la fiche d'une boutique → onglet **Diagnostic** — sa vitrine essayée à l'instant, son certificat, son statut, ses conditions, ses pannes et ses erreurs, qui reçoit ses e-mails, ses files coincées, son domaine d'envoi, SkanFact, son catalogue en stock, sa livraison, son paiement par carte, ses commandes ; ce qui bloque la vente d'abord, chaque point avec ce qu'il faut faire et le lien du geste. État technique → **Fiches réflexes** : sept symptômes (une vitrine qui ne s'ouvre plus, tout qui casse après une mise en ligne, les e-mails, SkanFact, une avalanche d'erreurs, un commerçant qui ne se connecte plus, un paiement par carte non confirmé), les gestes dans l'ordre.\n")
apres("docs/TESTER.md", "**Les tâches de fond** (console, **État technique**",
      "\n**Le diagnostic** (console, fiche d'une boutique → onglet **Diagnostic**) — tout ce qui fait qu'elle vend, relu à l'instant, ce qui bloque en tête, chaque point avec quoi faire. Les **fiches réflexes** (État technique, tout en bas) : que faire, dans l'ordre, quand ça casse.\n")
print("M6 : parcours et documentation posés")
