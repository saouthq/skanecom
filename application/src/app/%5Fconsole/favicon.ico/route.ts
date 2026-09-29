/* L'icône d'onglet de la console : un « S » blanc sur l'encre de la console,
   pour la distinguer d'un coup d'œil des onglets des boutiques. */
const ICONE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#121826"/><text x="16" y="23" text-anchor="middle" font-family="system-ui,sans-serif" font-size="20" font-weight="700" fill="#FFFFFF">S</text></svg>`;

export function GET() {
  return new Response(ICONE, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
}
