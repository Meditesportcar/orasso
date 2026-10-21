import { homedir } from "node:os";

// Dossier du relais du chantier (captures des recettes) : ORASSO_RELAIS, sinon ~/.claude/relais/orasso.
export const RELAIS = (process.env.ORASSO_RELAIS ?? `${homedir()}/.claude/relais/orasso`).replaceAll("\\", "/");
