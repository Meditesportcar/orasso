// Relance à la demande d'un membre du staff (lot 22, bouton « Relancer » de la casquette Organisateur de l'appli) :
// alias de la relance du lot 24 (`staffService.remind`), pour que les deux routes aient la même règle : une relance par
// jour et par personne, seulement à qui n'a pas répondu, jamais le jour J ni après le début de l'événement, écriture
// conditionnelle (un double clic = un seul envoi). Le chemin et la forme de la réponse du lot 22 sont conservés.
import { AppError } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { staffService } from "./service";

export const staffRemindService = {
  /** Organisateur : relance un membre du staff de l'événement dont la présence est inconnue. */
  async remind(v: Viewer, eventId: string, userId: string) {
    const { reminded } = await staffService.remind(v, eventId, userId);
    if (reminded === 0) {
      throw new AppError(409, "conflict", "Cette personne a déjà répondu ou a déjà été relancée aujourd'hui.");
    }
    return { reminded: true };
  },
};
