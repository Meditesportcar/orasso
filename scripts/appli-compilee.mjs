// Recettes de l'appli sur la version web COMPILÉE (`expo export`), au lieu de Metro. Essai mesuré (voir AVANCEMENT.md).
//   node scripts/appli-compilee.mjs [--port 8821] [--skip-export] [--clear]
// 1. compile l'appli (apps/mobile/dist/recette, hors git) avec l'API du .env intégrée au build ;
// 2. la sert sur le port demandé : repli vers index.html pour les routes d'expo-router, en-têtes d'isolation (COOP/COEP)
//    pour expo-sqlite en WebAssembly (mode staff), donc plus besoin de scripts/web-isolated.mjs.
// Les specs ne changent pas : APP_URL=http://localhost:<port>. Ctrl+C pour arrêter. Metro reste le mode par défaut.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mobile = join(root, "apps", "mobile");
const outDir = join(mobile, "dist", "recette");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

const env = {};
if (existsSync(join(root, ".env"))) {
  for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
}
const port = Number(option("--port", "8821"));

if (!flag("--skip-export")) {
  const t0 = Date.now();
  const expoBin = resolveExpoCli();
  const result = spawnSync(process.execPath, [expoBin, "export", "--platform", "web", "--output-dir", outDir, ...(flag("--clear") ? ["--clear"] : [])], {
    cwd: mobile,
    stdio: "inherit",
    env: {
      ...process.env,
      CI: "1",
      EXPO_NO_TELEMETRY: "1",
      EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ?? `http://localhost:${env.API_PORT ?? 3001}`,
      EXPO_PUBLIC_SITE_URL: process.env.EXPO_PUBLIC_SITE_URL ?? `http://localhost:${env.WEB_PORT ?? 5173}`,
      EXPO_PUBLIC_USE_RN_FETCH: "1",
      // Fonctions de recette (injection d'un scan, maintien du scan) : voir apps/mobile/src/lib/recette.ts.
      EXPO_PUBLIC_RECETTE: "1",
    },
  });
  if (result.status !== 0) {
    console.error("expo export a échoué");
    process.exit(result.status ?? 1);
  }
  console.log(`Compilation : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

function resolveExpoCli() {
  const p = join(root, "node_modules", "expo", "bin", "cli");
  if (!existsSync(p)) throw new Error(`Expo introuvable : ${p} (pnpm install ?)`);
  return p;
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".mp3": "audio/mpeg",
};

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let file = normalize(join(outDir, pathname));
  if (!file.startsWith(outDir)) {
    res.writeHead(403);
    res.end();
    return;
  }
  // Repli SPA : tout chemin qui n'est pas un fichier existant renvoie index.html (routes d'expo-router).
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(outDir, "index.html");
  const body = readFileSync(file);
  res.writeHead(200, {
    "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
    "cache-control": "no-store",
    "cross-origin-opener-policy": "same-origin",
    // `credentialless` : les images de l'API (autre port) restent lisibles sans en-tête CORP (comme web-isolated.mjs).
    "cross-origin-embedder-policy": "credentialless",
  });
  res.end(req.method === "HEAD" ? undefined : body);
});

server.listen(port, () => {
  console.log(`Appli compilée : http://localhost:${port} (API ${env.API_PORT ?? 3001}) — APP_URL=http://localhost:${port}`);
});
