// Base PostgreSQL 17 locale, sans installation système (binaires du paquet embedded-postgres).
// Usage : node scripts/db.mjs start | stop | status
// Réglages dans .env : DATABASE_URL (port, utilisateur, mot de passe, base) et DB_DATA_DIR (dossier des données).
// Chaque worktree peut avoir sa propre base : un port et un dossier différents dans son .env.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));

const url = new URL(process.env.DATABASE_URL ?? "postgres://orasso:orasso@localhost:54329/orasso");
const port = url.port || "5432";
const user = decodeURIComponent(url.username);
const password = decodeURIComponent(url.password);
const database = url.pathname.slice(1);
const dataDir = resolve(root, process.env.DB_DATA_DIR ?? ".data/pg");
const logFile = `${dataDir}.log`;

if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
  console.error(`DATABASE_URL pointe vers ${url.hostname} : ce script ne gère que la base locale.`);
  process.exit(1);
}

async function binaries() {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  try {
    return await import(`@embedded-postgres/${platform}-${process.arch}`);
  } catch {
    console.error(`Binaires PostgreSQL introuvables pour ${platform}-${process.arch}. Lancer « pnpm install ».`);
    process.exit(1);
  }
}

function run(bin, args) {
  return spawnSync(bin, args, { stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" });
}

// PostgreSQL reste lancé après la fin du script. S'il héritait d'un descripteur ouvert (la sortie de pnpm
// redirigée vers un tube, par exemple), tout programme qui lit cette sortie attendrait indéfiniment.
// Sous Windows, Start-Process lance pg_ctl sans lui transmettre aucun descripteur ; ailleurs, stdio ignoré suffit.
function startDetached(bin, args) {
  if (process.platform !== "win32") return spawnSync(bin, args, { stdio: "ignore" }).status;
  const quote = (s) => `'${s.replaceAll("'", "''")}'`;
  const argList = args.map((a) => (/[\s"]/.test(a) ? `"${a.replaceAll('"', '\\"')}"` : a)).join(" ");
  const command = `$p = Start-Process -FilePath ${quote(bin)} -ArgumentList ${quote(argList)} -WindowStyle Hidden -PassThru; $p.WaitForExit(); exit $p.ExitCode`;
  const powershell = join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  return spawnSync(powershell, ["-NoProfile", "-NonInteractive", "-Command", command], { stdio: "ignore" }).status;
}

function isRunning(pgCtl) {
  return existsSync(join(dataDir, "PG_VERSION")) && run(pgCtl, ["status", "-D", dataDir]).status === 0;
}

async function initCluster(initdb) {
  mkdirSync(dirname(dataDir), { recursive: true });
  const pwFile = join(tmpdir(), `orasso-pw-${process.pid}`);
  writeFileSync(pwFile, password);
  try {
    const res = run(initdb, [
      "-D",
      dataDir,
      "-U",
      user,
      `--pwfile=${pwFile}`,
      "--auth=scram-sha-256",
      "--encoding=UTF8",
      "--locale-provider=builtin",
      "--builtin-locale=C.UTF-8",
    ]);
    if (res.status !== 0) {
      console.error(res.stderr);
      process.exit(1);
    }
  } finally {
    rmSync(pwFile, { force: true });
  }
  console.log(`Base initialisée dans ${dataDir}`);
}

async function ensureDatabase() {
  const client = new pg.Client({ host: "localhost", port: Number(port), user, password, database: "postgres" });
  await client.connect();
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (!rowCount) {
      await client.query(`CREATE DATABASE "${database.replaceAll('"', '""')}"`);
      console.log(`Base « ${database} » créée`);
    }
  } finally {
    await client.end();
  }
}

async function start() {
  const { initdb, pg_ctl: pgCtl } = await binaries();
  if (!existsSync(join(dataDir, "PG_VERSION"))) await initCluster(initdb);
  if (!isRunning(pgCtl)) {
    // Base locale de développement et de test : pas d'écriture forcée sur le disque à chaque enregistrement
    // (fsync, synchronous_commit, full_page_writes). Les tests vont bien plus vite et le disque souffle.
    // Une coupure brutale peut abîmer la base : on la recrée (start puis seed).
    const status = startDetached(pgCtl, [
      "start",
      "-D",
      dataDir,
      "-l",
      logFile,
      "-w",
      "-o",
      `-p ${port} -c listen_addresses=localhost -c fsync=off -c synchronous_commit=off -c full_page_writes=off`,
    ]);
    if (status !== 0) {
      console.error(`Échec du démarrage de PostgreSQL. Voir ${logFile}`);
      process.exit(1);
    }
  }
  await ensureDatabase();
  console.log(`PostgreSQL prêt sur localhost:${port}, base « ${database} »`);
}

async function stop() {
  const { pg_ctl: pgCtl } = await binaries();
  if (!isRunning(pgCtl)) {
    console.log("PostgreSQL n'est pas lancé");
    return;
  }
  const res = run(pgCtl, ["stop", "-D", dataDir, "-m", "fast", "-w"]);
  if (res.status !== 0) {
    console.error(res.stderr);
    process.exit(1);
  }
  console.log("PostgreSQL arrêté");
}

async function status() {
  const { pg_ctl: pgCtl } = await binaries();
  console.log(isRunning(pgCtl) ? `PostgreSQL lancé sur localhost:${port} (${dataDir})` : "PostgreSQL arrêté");
}

const commands = { start, stop, status };
const command = commands[process.argv[2]];
if (!command) {
  console.error("Usage : node scripts/db.mjs start | stop | status");
  process.exit(1);
}
await command();
