import { practicalInput, roundZoneOutward, weatherCell } from "@orasso/shared";
import { Hono } from "hono";

import { rateLimit } from "../../lib/rateLimit";
import { type AppEnv, requireUser } from "../../lib/session";
import { body } from "../../lib/validate";
import { type PracticalTarget, practicalService } from "./service";

// Lot R8q : « Pratique ». POST, la position en corps de requête (une adresse finit dans les journaux d'accès). Rien n'est
// écrit, rien n'est rattaché au compte ; les sources de lieux ne reçoivent que des codes de département.
export const practicalRoutes = new Hono<AppEnv>().post("/practical", async (c) => {
  const v = await requireUser(c);
  rateLimit("practical", v.user.id);
  rateLimit("practicalHour", v.user.id);
  const input = await body(c, practicalInput);
  // La position est arrondie à la case de 0,1° dès la première ligne : la valeur reçue ne va pas plus loin.
  // Une zone de carte est arrondie vers l'extérieur au 0,1° de la même façon, avant tout autre usage.
  const target: PracticalTarget =
    input.near === "position"
      ? { near: "position", cell: weatherCell(input) }
      : input.near === "zone"
        ? { near: "zone", zone: roundZoneOutward(input) }
        : input.near === "outing"
          ? { near: "outing", ...(input.eventId ? { eventId: input.eventId } : {}) }
          : { near: "city" };
  c.header("cache-control", "private, no-store");
  return c.json(await practicalService.get(v, target));
});
