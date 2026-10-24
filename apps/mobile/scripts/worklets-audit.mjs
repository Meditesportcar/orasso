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

/** Ce qu'est un initialiseur : un worklet, une fonction JS ordinaire, une valeur, ou on ne sait pas. */
function initKind(init) {
  if (isFactoryCall(init)) return "worklet";
  if (isFunctionNode(init)) return "function";
  if (init?.type === "CallExpression" && init.callee.type === "Identifier" && init.callee.name === "useCallback")
    return "function";
  if (
    /Literal$|^(ObjectExpression|ArrayExpression|TemplateLiteral|BinaryExpression|UnaryExpression)$/.test(
      init?.type ?? "",
    )
  )
    return "value";
  return "unknown";
}

/** Ce qu'est le nom exporté `name` du module `file` (suit les réexportations) : worklet, fonction, valeur, inconnu. */
function exportKind(file, name, seen = new Set()) {
  if (!file || seen.has(`${file}#${name}`)) return "unknown";
  seen.add(`${file}#${name}`);
  let found = null;
  traverse(transformed(file), {
    ExportNamedDeclaration(p) {
      const d = p.node.declaration;
      if (d?.type === "VariableDeclaration") {
        for (const v of d.declarations) if (v.id.name === name) found = initKind(v.init);
      } else if (d?.id?.name === name) found = d.type === "FunctionDeclaration" ? "function" : "value";
      for (const s of p.node.specifiers ?? []) {
        if ((s.exported.name ?? s.exported.value) !== name) continue;
        found = p.node.source
          ? exportKind(resolveModule(file, p.node.source.value), s.local.name, seen)
          : valueKind(file, p.scope.getBinding(s.local.name), seen);
      }
    },
    ExportAllDeclaration(p) {
      if (found !== null) return;
      const kind = exportKind(resolveModule(file, p.node.source.value), name, seen);
      if (kind !== "unknown") found = kind;
    },
  });
  return found ?? "unknown";
}

/** Le nom exporté `name` du module `file` est-il un worklet ? (suit les réexportations) */
function exportIsWorklet(file, name, seen = new Set()) {
  return exportKind(file, name, seen) === "worklet";
}

/** Ce qu'est une liaison du module : worklet, fonction JS ordinaire, valeur, ou inconnu (prop, import non résolu…). */
function valueKind(file, binding, seen = new Set()) {
  if (!binding) return "unknown";
  if (binding.path.isFunctionDeclaration()) return "function";
  if (binding.path.isVariableDeclarator())
    return binding.path.node.id.type === "Identifier" ? initKind(binding.path.node.init) : "unknown";
  const source = importSource(binding);
  if (source === null) return "unknown";
  if (SAFE_PACKAGES.test(source)) return "worklet";
  if (binding.path.isImportNamespaceSpecifier()) return "value";
  const n = binding.path.node;
  const imported = binding.path.isImportDefaultSpecifier() ? "default" : (n.imported.name ?? n.imported.value);
  return exportKind(resolveModule(file, source), imported, seen);
}

/** La racine d'une chaîne d'appel (`a.b.c`, `a["b"]`, `a?.b`) : l'identifiant de tête et le chemin (`null` : calculé). */
function rootOf(node) {
  const members = [];
  let n = node;
  while (n.type === "MemberExpression" || n.type === "OptionalMemberExpression") {
    if (!n.computed) members.unshift(n.property.name);
    else members.unshift(n.property.type === "StringLiteral" ? n.property.value : null);
    n = n.object;
  }
  return n.type === "Identifier" ? { name: n.name, path: members } : null;
}

/** Crochets dont le résultat est une valeur partagée (ou une référence animée) : sûrs sur le fil UI. */
const SHARED_HOOKS = /^(useSharedValue|useDerivedValue|useAnimatedRef|useScrollViewOffset|makeMutable)$/;
/** Méthodes qui appellent la fonction qu'on leur passe. */
const HIGHER_ORDER = new Set([
  "map",
  "forEach",
  "filter",
  "reduce",
  "reduceRight",
  "some",
  "every",
  "find",
  "findIndex",
  "flatMap",
  "sort",
]);
/** Appels qui renvoient vers le fil JS : la fonction passée n'a pas à être un worklet. */
const JS_THREAD_HOPS = new Set(["runOnJS", "scheduleOnRN"]);

/** La fonction d'un crochet `name` de ce module ou d'un module importé, avec son fichier (ou `null`). */
function hookFunction(file, name, seen = new Set()) {
  if (!file || seen.has(`${file}#${name}`)) return null;
  seen.add(`${file}#${name}`);
  let found = null;
  traverse(transformed(file), {
    FunctionDeclaration(p) {
      if (p.node.id?.name === name && (p.parentPath.isProgram() || p.parentPath.isExportNamedDeclaration()))
        found ??= { fn: p, file };
    },
    VariableDeclarator(p) {
      if (p.node.id.name === name && isFunctionNode(p.node.init)) found ??= { fn: p.get("init"), file };
    },
    ImportSpecifier(p) {
      if (p.node.local.name !== name || found) return;
      found = hookFunction(
        resolveModule(file, p.parent.source.value),
        p.node.imported.name ?? p.node.imported.value,
        seen,
      );
    },
  });
  return found;
}

/** Champs de crochets connus pour être des valeurs simples (sérialisables) : `useTheme().reducedMotion` est un booléen. */
const KNOWN_PRIMITIVES = { useTheme: new Set(["reducedMotion"]) };

/** Le crochet appelé par l'initialiseur d'une liaison, et le champ pris par déstructuration (`null` : tout le résultat). */
function hookOf(binding, name) {
  const decl = binding?.path.isVariableDeclarator() ? binding.path.node : null;
  const init = decl?.init;
  const hook = init?.type === "CallExpression" && init.callee.type === "Identifier" ? init.callee.name : null;
  if (!hook) return null;
  if (decl.id.type !== "ObjectPattern") return { hook, key: null };
  const prop = decl.id.properties.find(
    (q) => q.type === "ObjectProperty" && q.value.type === "Identifier" && q.value.name === name,
  );
  return prop && !prop.computed ? { hook, key: prop.key.name ?? prop.key.value } : { hook, key: undefined };
}

/**
 * Le résultat de crochet capturé sous `name` est-il sûr sur le fil UI ? Oui pour une valeur partagée (`useSharedValue`
 * et ses pareils) ou un champ simple connu ; pour un crochet de l'appli ou du design system, chacun de ses `return` doit
 * rendre, pour ce champ, une valeur partagée ou un champ simple connu. Sinon : non résolu (signalé).
 */
function hookResultSafe(file, binding, name, depth = 0) {
  const found = hookOf(binding, name);
  if (!found || found.key === undefined || depth > 3) return false;
  const { hook, key } = found;
  if (SHARED_HOOKS.test(hook)) return key === null;
  if (key !== null && KNOWN_PRIMITIVES[hook]?.has(key)) return true;
  const def = hookFunction(file, hook);
  if (!def) return false;
  const fn = def.fn;
  const safe = (expr, scope) => {
    if (expr?.type === "CallExpression" && expr.callee.type === "Identifier")
      return SHARED_HOOKS.test(expr.callee.name);
    if (expr?.type === "Identifier") return hookResultSafe(def.file, scope.getBinding(expr.name), expr.name, depth + 1);
    return false;
  };
  const pick = (arg, scope) => {
    if (key === null) {
      if (arg?.type === "ObjectExpression")
        return (
          arg.properties.length > 0 && arg.properties.every((q) => q.type === "ObjectProperty" && safe(q.value, scope))
        );
      return safe(arg, scope);
    }
    if (arg?.type !== "ObjectExpression") return false;
    const prop = arg.properties.find(
      (q) => q.type === "ObjectProperty" && !q.computed && (q.key.name ?? q.key.value) === key,
    );
    return Boolean(prop) && safe(prop.value, scope);
  };
  if (fn.node.body.type !== "BlockStatement") return pick(fn.node.body, fn.scope);
  let returns = 0;
  let ok = true;
  fn.traverse({
    ReturnStatement(r) {
      if (r.getFunctionParent() !== fn) return;
      returns++;
      if (!pick(r.node.argument, r.scope)) ok = false;
    },
  });
  return returns > 0 && ok;
}

/** La capture est-elle une valeur partagée (pour `.get()`, `.set()`, `.modify()`) ? */
const hookGivesSharedValues = (file, binding, name) => hookResultSafe(file, binding, name);

/** Un appel sur membre d'une capture (`a.b()`) est-il permis sur le fil UI ? */
function memberCallAllowed(file, outer, name, members) {
  const source = importSource(outer);
  if (source !== null && SAFE_PACKAGES.test(source)) return true;
  if (members.length === 1 && members[0] !== null) {
    if (outer?.path.isImportNamespaceSpecifier() && exportIsWorklet(resolveModule(file, source), members[0]))
      return true;
    if (/^(get|set|modify)$/.test(members[0]) && hookGivesSharedValues(file, outer, name)) return true;
  }
  return false;
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
      // Une capture : le nom vient de `const { … } = this.__closure` (et pas d'une variable du worklet qui le masque).
      const captured = (sp, name) => {
        if (!closure.has(name)) return false;
        const b = sp.scope.getBinding(name);
        const init = b?.path.isVariableDeclarator() ? b.path.node.init : null;
        return init?.type === "MemberExpression" && init.property?.name === "__closure";
      };
      // 2 et 3 (tour 2 : appels optionnels `f?.()`, sur membre ou calculés `a.b.c()`, `a["b"]()`, depuis la racine
      // capturée ; et les fonctions capturées passées en argument, `[1].map(f)`). Un cas non résolu est signalé.
      // Le plugin réécrit `onDone?.()` en `(_onDone = onDone) === null || … || _onDone()` : une variable du worklet qui
      // reçoit une capture (ou un membre d'une capture) est suivie jusqu'à elle.
      const aliases = new Map();
      const noteAlias = (left, right, sp) => {
        if (left?.type !== "Identifier" || !right) return;
        const r = rootOf(right);
        if (!r) return;
        const base = captured(sp, r.name) ? { name: r.name, path: r.path } : aliases.get(r.name);
        if (base)
          aliases.set(left.name, { name: base.name, path: [...base.path, ...(captured(sp, r.name) ? [] : r.path)] });
      };
      traverse(workletAst, {
        AssignmentExpression: (ap) => noteAlias(ap.node.left, ap.node.right, ap),
        VariableDeclarator: (vp) => noteAlias(vp.node.id, vp.node.init, vp),
      });
      const onCall = (cp) => {
        const callee = cp.node.callee;
        let root = rootOf(callee);
        const alias = root && !captured(cp, root.name) ? aliases.get(root.name) : undefined;
        if (alias) root = { name: alias.name, path: [...alias.path, ...root.path] };
        if (root && captured(cp, root.name)) {
          const outer = p.scope.getBinding(root.name);
          const shown = `${root.name}${root.path.map((m) => (m === null ? "[…]" : `.${m}`)).join("")}`;
          if (root.path.length === 0) {
            if (!bindingIsWorklet(file, outer))
              issues.push(`${label} : appel de « ${shown}() » (${describe(outer)}), pas un worklet`);
          } else if (!memberCallAllowed(file, outer, root.name, root.path)) {
            issues.push(`${label} : appel de « ${shown}() » (${describe(outer)}) à vérifier`);
          }
        }
        // Les fonctions capturées passées à un appel s'exécutent sur le fil UI (sauf `runOnJS` / `scheduleOnRN`).
        const calleeName = callee.type === "Identifier" ? callee.name : null;
        if (calleeName && JS_THREAD_HOPS.has(calleeName)) return;
        const method = root?.path.at(-1) ?? null;
        for (const arg of cp.node.arguments) {
          if (arg.type !== "Identifier" || !captured(cp, arg.name)) continue;
          const outer = p.scope.getBinding(arg.name);
          if (bindingIsWorklet(file, outer)) continue;
          const kind = valueKind(file, outer);
          if (kind === "function" || (kind === "unknown" && method !== null && HIGHER_ORDER.has(method)))
            issues.push(`${label} : « ${arg.name} » (${describe(outer)}) passée en argument, pas un worklet`);
        }
      };
      traverse(workletAst, { CallExpression: onCall, OptionalCallExpression: onCall });
      // 4 (tour 2 : aussi les résultats de crochets qui ne sont pas des valeurs partagées, comme `useNavigation()`)
      for (const name of closure) {
        const b = p.scope.getBinding(name);
        const d = describe(b);
        if (d === "useRef()" || d === "new") issues.push(`${label} : capture « ${name} » (${d}) à vérifier`);
        else if (/^use\w*\(\)$/.test(d) && !hookResultSafe(file, b, name))
          issues.push(`${label} : capture « ${name} » (${d}) à vérifier`);
      }
    },
  });
  return { worklets, issues };
}

/**
 * Relus un par un et sans danger sur le fil UI (justification écrite, à revoir si le code change).
 * - brandCar : `windowPolygons` est un tableau de nombres (géométrie de la vitre) ; `.map` est une méthode de tableau.
 * - Motion (tour 2) : `size` (`{ width, height } | null`) et `height` (nombre), états mesurés par `onLayout` : des
 *   valeurs simples, recopiées à chaque rendu dans le style animé.
 */
export const REVIEWED = [
  /olive\/brandCar\.tsx:\d+ windowPathAt_brandCarTsx\d+ : appel de « windowPolygons\.map\(\) »/,
  /native\/Motion\.tsx:\d+ MotionTsx\d+ : capture « (size|height) » \(useState\(\)\) à vérifier/,
];

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
