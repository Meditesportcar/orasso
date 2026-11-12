import { z } from "zod";

import { inFrance } from "../rules/myWeather";

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
  z.object({ near: z.literal("city") }).strict(),
  z.object({ near: z.literal("outing"), eventId: z.string().uuid("Identifiant invalide").optional() }).strict(),
]);
export type PracticalInput = z.infer<typeof practicalInput>;
