// Avance le temps d'Orasso en développement (horloge simulée, lot 34a) : même décalage et mêmes rattrapages que la page
// `/admin/horloge`, sans authentification (comme le seed). Réservé au développement : refuse de tourner en production
// ou sans DEV_CLOCK=on dans le .env.
//
//   pnpm dev:clock status
//   pnpm dev:clock +2h            (aussi +1d, +1d4h, +30m)
//   pnpm dev:clock to 2026-11-18T09:00     (heure de Paris sans fuseau ; avec Z ou +01:00, tel quel)
//   pnpm dev:clock event <slug> h-2|start|end|j+2|j+8
//   pnpm dev:clock reset
//
// Le décalage ne fait qu'avancer ; `reset` revient à l'heure réelle. L'API en marche relit le décalage en moins de 3 s.
import { clockMilestones, fromWallTime, parseDurationMs } from "@orasso/shared";

import { pool } from "../src/db/client";
import { env } from "../src/env";
import { startJobs } from "../src/jobs";
import { installDevClock, stopDevClockPolling } from "../src/lib/dev-clock";
import { devClockService } from "../src/modules/dev-clock/service";

if (env.NODE_ENV === "production" || process.env.NODE_ENV === "production") {
  console.error("dev:clock est réservé au développement.");
  process.exit(2);
}
if (!env.DEV_CLOCK) {
  console.error("DEV_CLOCK=on est requis dans le .env (et pour l'API) : l'horloge simulée n'est pas active.");
  process.exit(2);
}

const usage: () => never = () => {
  console.error("Usage : pnpm dev:clock status | +2h | +1d | to <date> | event <slug> h-2|start|end|j+2|j+8 | reset");
  process.exit(2);
};

/** « 2026-11-18T09:00 » (heure de Paris) ou une date ISO complète avec fuseau. */
function parseTarget(text: string): string {
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) return new Date(text).toISOString();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?$/.exec(text);
  if (!m) throw new Error(`Date illisible : « ${text} » (attendu : 2026-11-18T09:00).`);
  return fromWallTime({
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4] ?? 0),
    minute: Number(m[5] ?? 0),
  }).toISOString();
}

const [command, a, b] = process.argv.slice(2);
if (!command) usage();

await installDevClock({ poll: false });
// Les tâches replanifiées par les balayages partent vers pg-boss (l'API les exécute), jamais dans une file perdue.
const boss = await startJobs({ work: false });
let code = 0;
try {
  const opts = { updatedBy: "script", waitForPeers: true };
  if (command === "status") {
    console.log(JSON.stringify(await devClockService.status(), null, 2));
  } else if (command === "reset") {
    console.log(JSON.stringify(await devClockService.reset({ updatedBy: "script" }), null, 2));
  } else if (command === "to") {
    if (!a) usage();
    console.log(JSON.stringify(await devClockService.advance({ to: parseTarget(a as string) }, opts), null, 2));
  } else if (command === "event") {
    if (!a || !b || !(clockMilestones as readonly string[]).includes(b)) usage();
    const milestone = b as (typeof clockMilestones)[number];
    console.log(JSON.stringify(await devClockService.advance({ slug: a, milestone }, opts), null, 2));
  } else if (command.startsWith("+") || parseDurationMs(command) !== null) {
    console.log(JSON.stringify(await devClockService.advance({ by: command }, opts), null, 2));
  } else {
    usage();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  code = 1;
} finally {
  stopDevClockPolling();
  await boss.stop();
  await pool.end();
}
process.exit(code);
