// Audit statique des worklets (lot R1, 24/10) : ce que les recettes web ne voient pas. Sur le téléphone, chaque
// worklet est recompilé à partir de son texte sur le fil UI, avec ses seules captures (`__closure`) : une constante de
// module en valeur par défaut d'un paramètre (plantage « Property 'LOUPE_SIZE' doesn't exist » du 24/10) ou l'appel
// d'une fonction JS ordinaire y plantent, alors que le navigateur exécute la fonction d'origine sans rien dire.
//
// Le fichier passe par le vrai plugin `react-native-worklets/plugin` (celui de babel-preset-expo), puis on relit chaque
// worklet produit :
//   1. identifiants libres de son texte (hors globales du fil UI) : ils n'existent pas sur le téléphone ;
//   2. appels de fonctions capturées qui ne sont pas des worklets (fonction locale, prop, import ordinaire) ;
//   3. appels de méthodes d'un objet capturé (à vérifier, sauf `.value`/`.get`/`.set` d'une valeur partagée) ;
//   4. captures douteuses : `useRef` de React (l'objet est figé une fois passé au fil UI), `new …` ;
//   5. rappels passés aux crochets du fil UI (`useAnimatedStyle`, `withTiming`…) qui ne sont pas des worklets ;
//   6. `Easing` de react-native dans une animation Reanimated.
// `Date.now()` et `Math.random()` sont permis (globales du fil UI).
//
// En ligne de commande (avant chaque APK) : `node apps/mobile/scripts/worklets-audit.mjs` depuis la racine du dépôt.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const mobileDir = path.resolve(here, "..");
const repoRoot = path.resolve(mobileDir, "../..");
const require = createRequire(path.join(mobileDir, "package.json"));
const babel = require("@babel/core");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const presetTs = require.resolve("@babel/preset-typescript");
const workletsPlugin = require.resolve("react-native-worklets/plugin");

/** Globales réellement présentes sur le fil UI (sous-ensemble prudent de la liste du plugin). */
const UI_GLOBALS = new Set(
  [
    "Math Date Number String Object Array JSON Boolean Symbol Map Set WeakMap WeakSet BigInt RegExp Promise",
    "Infinity NaN undefined globalThis global console performance arguments _WORKLET",
    "Error TypeError RangeError isNaN isFinite parseInt parseFloat",
    "Float32Array Float64Array Int32Array Uint8Array Uint8ClampedArray ArrayBuffer",
    "requestAnimationFrame cancelAnimationFrame",
  ]
    .join(" ")
    .split(" "),
);
/** Paquets dont toutes les fonctions sont des worklets (ou des appels permis depuis un worklet). */
const SAFE_PACKAGES = /^react-native-(reanimated|worklets|gesture-handler)$/;
/** Crochets et fonctions dont les rappels tournent sur le fil UI. */
const UI_CALLBACK_TAKERS = new Set([
  "useAnimatedStyle",
  "useAnimatedProps",
  "useDerivedValue",
  "useAnimatedReaction",
  "useFrameCallback",
  "useAnimatedScrollHandler",
  "runOnUI",
  "scheduleOnUI",
  "withTiming",
  "withSpring",
  "withDecay",
  "withRepeat",
  "withDelay",
]);

const SOURCE_DIRS = ["apps/mobile/src", "packages/design-system/src/native"];

function listSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSources(p));
    // Les variantes `.web` ne vont pas sur le téléphone.
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|web|d)\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

const astCache = new Map();
function transformed(file, code) {
  const key = code === undefined ? file : `${file}\0${code}`;
  if (astCache.has(key)) return astCache.get(key);
  const res = babel.transformSync(code ?? readFileSync(file, "utf8"), {
    filename: file,
    babelrc: false,
    configFile: false,
    ast: true,
    code: false,
    presets: [[presetTs, { isTSX: true, allExtensions: true }]],
    plugins: [workletsPlugin],
  });
  astCache.set(key, res.ast);
  return res.ast;
}

/** Résolution comme Metro pour Android (`.android`, puis `.native`, puis le fichier commun). */
function resolveModule(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = path.join(mobileDir, "src", spec.slice(2));
  else if (spec === "@orasso/design-system/native")
    base = path.join(repoRoot, "packages/design-system/src/native/index");
  else if (spec === "@orasso/design-system") base = path.join(repoRoot, "packages/design-system/src/index");
  else if (spec === "@orasso/shared") base = path.join(repoRoot, "packages/shared/src/index");
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  base = base.replace(/\.(js|ts|tsx)$/, "");
  for (const ext of [
    ".android.tsx",
    ".android.ts",
    ".native.tsx",
    ".native.ts",
    ".tsx",
    ".ts",
    "/index.tsx",
    "/index.ts",
  ]) {
    const p = base + ext;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

/** Une usine de worklet produite par le plugin : `function xFactory({ _worklet_N_init_data, … }) {…}({…})`. */
const isFactoryCall = (n) =>
  n?.type === "CallExpression" && n.callee.type === "FunctionExpression" && /Factory$/.test(n.callee.id?.name ?? "");
const isFunctionNode = (n) => n?.type === "ArrowFunctionExpression" || n?.type === "FunctionExpression";

/** Le nom exporté `name` du module `file` est-il un worklet ? (suit les réexportations) */
function exportIsWorklet(file, name, seen = new Set()) {
  if (!file || seen.has(`${file}#${name}`)) return false;
  seen.add(`${file}#${name}`);
  let found = null;
  traverse(transformed(file), {
    ExportNamedDeclaration(p) {
      const d = p.node.declaration;
      if (d?.type === "VariableDeclaration") {
        for (const v of d.declarations) if (v.id.name === name) found = isFactoryCall(v.init);
      } else if (d?.id?.name === name) found = false;
      for (const s of p.node.specifiers ?? []) {
        if ((s.exported.name ?? s.exported.value) !== name) continue;
        found = p.node.source
          ? exportIsWorklet(resolveModule(file, p.node.source.value), s.local.name, seen)
          : bindingIsWorklet(file, p.scope.getBinding(s.local.name), seen);
      }
    },
    ExportAllDeclaration(p) {
      if (found === null && exportIsWorklet(resolveModule(file, p.node.source.value), name, seen)) found = true;
    },
  });
  return found === true;
}

function importSource(binding) {
  const p = binding?.path;
  if (p && (p.isImportSpecifier() || p.isImportDefaultSpecifier() || p.isImportNamespaceSpecifier()))
    return p.parent.source.value;
  return null;
}

function bindingIsWorklet(file, binding, seen = new Set()) {
  if (!binding) return false;
  if (binding.path.isVariableDeclarator()) return isFactoryCall(binding.path.node.init);
  const source = importSource(binding);
  if (source === null) return false;
  if (SAFE_PACKAGES.test(source)) return true;
  if (binding.path.isImportNamespaceSpecifier()) return false;
  const n = binding.path.node;
  const imported = binding.path.isImportDefaultSpecifier() ? "default" : (n.imported.name ?? n.imported.value);
  return exportIsWorklet(resolveModule(file, source), imported, seen);
}

function bindingIsFunction(binding) {
  if (!binding) return false;
  if (binding.path.isFunctionDeclaration()) return true;
  return binding.path.isVariableDeclarator() && isFunctionNode(binding.path.node.init);
}

function describe(binding) {
  if (!binding) return "inconnu";
  const source = importSource(binding);
  if (source !== null) return `import de ${source}`;
  if (binding.path.isVariableDeclarator()) {
    const init = binding.path.node.init;
    if (isFactoryCall(init)) return "worklet";
    if (init?.type === "CallExpression" && init.callee.type === "Identifier") return `${init.callee.name}()`;
    if (init?.type === "NewExpression") return "new";
    return init?.type ?? "variable";
  }
  return binding.kind;
}

/** Identifiants libres du texte d'un worklet. Une valeur par défaut de paramètre ne voit pas les `const` du corps. */
function readWorkletCode(code) {
  const ast = parser.parse(code, { sourceType: "module" });
  const free = new Set();
  let closure = new Set();
  traverse(ast, {
    VariableDeclarator(p) {
      const init = p.node.init;
      if (
        init?.type === "MemberExpression" &&
        init.object.type === "ThisExpression" &&
        init.property.name === "__closure"
      )
        closure = new Set(p.node.id.properties.map((q) => q.key.name));
    },
    ReferencedIdentifier(p) {
      if (p.parentPath.isMemberExpression({ property: p.node }) && !p.parent.computed) return;
      const binding = p.scope.getBinding(p.node.name);
      const fn = p.getFunctionParent();
      const inParams = fn && p.findParent((q) => q.listKey === "params" && q.parentPath === fn);
      if (!binding) free.add(p.node.name);
      else if (inParams && binding.kind !== "param" && binding.scope === fn.scope) free.add(p.node.name);
    },
  });
  return { ast, free, closure };
}

/** Les défauts de worklets d'un fichier (texte optionnel : pour les essais). */
export function auditFile(file, code) {
  const ast = transformed(file, code);
  const rel = path.relative(repoRoot, file).replaceAll("\\", "/");
  const issues = [];
  let worklets = 0;
  traverse(ast, {
    CallExpression(p) {
      const callee = p.node.callee;
      // 5 et 6 : ce qu'on passe aux crochets du fil UI.
      if (callee.type === "Identifier" && UI_CALLBACK_TAKERS.has(callee.name)) {
        const where = `${rel}:${p.node.loc?.start.line ?? "?"} ${callee.name}`;
        for (const arg of p.node.arguments) {
          if (isFunctionNode(arg)) issues.push(`${where} : rappel qui n'est pas un worklet`);
          else if (arg.type === "Identifier" && bindingIsFunction(p.scope.getBinding(arg.name)))
            issues.push(`${where} : « ${arg.name} » n'est pas un worklet`);
          else if (arg.type === "ObjectExpression") {
            const easing = arg.properties.find((q) => q.key?.name === "easing");
            let root = easing?.value;
            while (root && (root.type === "CallExpression" || root.type === "MemberExpression"))
              root = root.type === "CallExpression" ? root.callee : root.object;
            if (root?.type === "Identifier" && importSource(p.scope.getBinding(root.name)) === "react-native")
              issues.push(`${where} : Easing de react-native (prendre celui de Reanimated)`);
          }
        }
      }
      if (!isFactoryCall(p.node)) return;
      worklets++;
      const factory = p.node.callee;
      const label = `${rel}:${factory.loc?.start.line ?? "?"} ${factory.id.name.replace(/Factory$/, "")}`;
      const initName = p.node.arguments[0].properties.find((q) => /_init_data$/.test(q.key.name)).key.name;
      const init = p.scope.getBinding(initName).path.node.init;
      const code = init.properties.find((q) => q.key.name === "code").value.value;
      const { ast: workletAst, free, closure } = readWorkletCode(code);
      // 1
      for (const name of free)
        if (!UI_GLOBALS.has(name)) issues.push(`${label} : « ${name} » n'existe pas sur le fil UI (non capturé)`);
      // 2 et 3
      traverse(workletAst, {
        CallExpression(cp) {
          const c = cp.node.callee;
          let name;
          let member;
          if (c.type === "Identifier") name = c.name;
          else if (c.type === "MemberExpression" && c.object.type === "Identifier" && !c.computed) {
            name = c.object.name;
            member = c.property.name;
          } else return;
          if (!closure.has(name)) return;
          const outer = p.scope.getBinding(name);
          if (member === undefined) {
            if (!bindingIsWorklet(file, outer))
              issues.push(`${label} : appel de « ${name}() » (${describe(outer)}), pas un worklet`);
            return;
          }
          const source = importSource(outer);
          if (source !== null && SAFE_PACKAGES.test(source)) return;
          if (outer?.path.isImportNamespaceSpecifier() && exportIsWorklet(resolveModule(file, source), member)) return;
          const shared = /^(useSharedValue|useDerivedValue|makeMutable)\(\)$/.test(describe(outer));
          if (shared && /^(get|set|modify)$/.test(member)) return;
          issues.push(`${label} : appel de « ${name}.${member}() » (${describe(outer)}) à vérifier`);
        },
      });
      // 4
      for (const name of closure) {
        const d = describe(p.scope.getBinding(name));
        if (d === "useRef()" || d === "new") issues.push(`${label} : capture « ${name} » (${d}) à vérifier`);
      }
    },
  });
  return { worklets, issues };
}

/**
 * Relus un par un et sans danger sur le fil UI (justification écrite, à revoir si le code change).
 * - brandCar : `windowPolygons` est un tableau de nombres (géométrie de la vitre) ; `.map` est une méthode de tableau.
 */
export const REVIEWED = [/olive\/brandCar\.tsx:\d+ windowPathAt_brandCarTsx\d+ : appel de « windowPolygons\.map\(\) »/];

/** Tout ce qui part sur le téléphone : l'appli et les composants natifs du design system. */
export function auditAll() {
  let worklets = 0;
  let files = 0;
  const issues = [];
  for (const dir of SOURCE_DIRS) {
    for (const file of listSources(path.join(repoRoot, dir))) {
      const text = readFileSync(file, "utf8");
      if (!/react-native-(reanimated|worklets|gesture-handler)|worklet/.test(text)) continue;
      files++;
      const res = auditFile(file);
      worklets += res.worklets;
      issues.push(...res.issues);
    }
  }
  const reviewed = issues.filter((issue) => REVIEWED.some((r) => r.test(issue)));
  return { files, worklets, issues: issues.filter((issue) => !reviewed.includes(issue)), reviewed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { files, worklets, issues, reviewed } = auditAll();
  console.log(`${worklets} worklets dans ${files} fichiers ; ${reviewed.length} cas relus et permis.`);
  for (const issue of issues) console.log(`- ${issue}`);
  if (!issues.length) console.log("Aucun défaut de worklet.");
  process.exitCode = issues.length ? 1 : 0;
}
