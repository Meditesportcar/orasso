import { z } from "zod";

import { inFrance } from "../rules/myWeather";
import { zoneCenter, zoneIsWellFormed, zoneRequestTooBig } from "../rules/practicalZone";

// Lot R8q : « Pratique ». `POST /practical` : la position voyage en corps de requête, jamais dans l'adresse (une adresse
// finit dans les journaux d'accès). Elle est arrondie à la case de 0,1° par le service, dès sa première ligne.
const coordinate = (axis: "lat" | "lng") =>
  z
    .number({ message: "Coordonnée invalide" })
    .refine((n) => Number.isFinite(n), "Coordonnée invalide")
    .refine((n) => (axis === "lat" ? Math.abs(n) <= 90 : Math.abs(n) <= 180), "Coordonnée invalide");

export const practicalInput = z.discriminatedUnion("near", [
  z
    .object({ near: z.literal("position"), lat: coordinate("lat"), lng: coordinate("lng") })
    .strict()
    .refine((p) => inFrance(p), { message: "Position hors de France", path: ["lat"] }),
  // Petit lot de fin F : la zone regardée sur la carte (quatre bords). Arrondie vers l'extérieur au 0,1° par le service dès sa première
  // ligne ; refusée au-delà de 60 km de côté (une fois arrondie). Jamais la position de la personne.
  z
    .object({
      near: z.literal("zone"),
      south: coordinate("lat"),
      west: coordinate("lng"),
      north: coordinate("lat"),
      east: coordinate("lng"),
      // Page suivante de la MÊME zone (opaque, rendu par l'API) ; rien de géographique de plus.
      cursor: z.string().min(1).max(120).optional(),
    })
    .strict()
    .refine((p) => zoneIsWellFormed(p), { message: "Zone invalide", path: ["south"] })
    .refine((p) => !zoneIsWellFormed(p) || inFrance(zoneCenter(p)), { message: "Zone hors de France", path: ["south"] })
    .refine((p) => !zoneIsWellFormed(p) || !zoneRequestTooBig(p), {
      message: "Zone trop grande : 60 km de côté au plus (plus l'arrondi)",
      path: ["south"],
    }),
  z.object({ near: z.literal("city") }).strict(),
  z.object({ near: z.literal("outing"), eventId: z.string().uuid("Identifiant invalide").optional() }).strict(),
]);
export type PracticalInput = z.infer<typeof practicalInput>;
