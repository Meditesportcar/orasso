import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";

// Dossier du relais du chantier (captures des recettes) : ORASSO_RELAIS, sinon ~/.claude/relais/orasso.
export const RELAIS = (process.env.ORASSO_RELAIS ?? `${homedir()}/.claude/relais/orasso`).replaceAll("\\", "/");

/**
 * Lot R8r : le dossier d'un outil de captures « avant | après ». `CAPTURES_DIR` prime sur le dossier du relais ; un dossier
 * « avant » déjà rempli n'est jamais écrasé (les captures d'avant sont prises une seule fois, avant le code) sauf
 * `CAPTURES_OVERWRITE_AVANT=1`.
 */
export function phaseDir(defaultDir: string, phase: string): string {
  const dir = process.env.CAPTURES_DIR ?? defaultDir;
  if (phase === "avant" && !process.env.CAPTURES_OVERWRITE_AVANT && existsSync(dir) && readdirSync(dir).length > 0) {
    throw new Error(
      `Les captures « avant » existent déjà dans ${dir} : elles ne s'écrasent pas (CAPTURES_OVERWRITE_AVANT=1 pour forcer).`,
    );
  }
  return dir;
}
