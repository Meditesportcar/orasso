// Lot R7c2 : une demande en attente ne compte pas deux fois à la cloche. Sa notification (`follow_request`,
// `crew_invitation`…) n'est ni dans la liste de l'Activité ni dans sa pastille « non vus » : la ligne « Demandes · N »
// (GET /me/requests, `pendingRequests`) la porte, avec ses boutons.
import { fromWallTime, requestNotificationTypes } from "@orasso/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { signUp as baseSignUp, call, resetDb, seedReference, useClock } from "../../../test/helpers";
import { db, pool } from "../../db/client";
import { notifications } from "../../db/schema";
import { withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetDb();
  useClock(fromWallTime({ year: 2026, month: 11, day: 9, hour: 15, minute: 0 }));
  await seedReference();
});

type Type = Parameters<typeof notificationsService.notify>[2];

async function send(userId: string, type: Type) {
  await withTx((tx) => notificationsService.notify(tx, userId, type, { title: "Titre", body: "Texte" }));
  await notificationsService.deliverDue();
}

describe("annonces de demandes (lot R7c2)", () => {
  it("la liste des types annoncés couvre les sortes de demandes servies à la cloche", () => {
    expect(requestNotificationTypes).toEqual(
      expect.arrayContaining([
        "follow_request",
        "contact_request",
        "crew_request",
        "crew_invitation",
        "crew_registration_to_confirm",
        "staff_invitation",
        "event_invitation_received",
        "event_invited",
        "plate_transfer_request",
      ]),
    );
  });

  it("une annonce de demande n'est ni dans l'Activité ni dans la pastille ; une autre notification, si", async () => {
    const damien = await baseSignUp("Damien_66");
    await notificationsService.flush();
    await db.delete(notifications).where(eq(notifications.userId, damien.id));
    for (const type of requestNotificationTypes) await send(damien.id, type as Type);
    expect((await call(damien, "GET", "/me/activity/count")).json).toEqual({ unseen: 0 });
    const page = (await call(damien, "GET", "/me/activity")).json;
    expect(page.groups).toEqual([]);

    await send(damien.id, "event_updated");
    expect((await call(damien, "GET", "/me/activity/count")).json).toEqual({ unseen: 1 });
    const types = (await call(damien, "GET", "/me/activity")).json.groups.flatMap(
      (g: { items: { type: string }[] }) => g.items.map((i) => i.type),
    );
    expect(types).toEqual(["event_updated"]);
  });
});
