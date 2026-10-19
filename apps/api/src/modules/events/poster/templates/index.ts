// Les huit gabarits d'affiche (lot 47), un fichier par style, fidèles au CSS du prototype (`.pz.<style>`).
import type { PosterStyle } from "@orasso/shared";

import type { PosterCtx, PosterLayout } from "../types";
import { damier } from "./damier";
import { jdm } from "./jdm";
import { mag } from "./mag";
import { minimal } from "./minimal";
import { neon } from "./neon";
import { retro } from "./retro";
import { swiss } from "./swiss";
import { ticket } from "./ticket";

export const posterTemplates: Record<PosterStyle, (ctx: PosterCtx) => PosterLayout> = {
  neon,
  swiss,
  retro,
  jdm,
  ticket,
  mag,
  minimal,
  damier,
};
