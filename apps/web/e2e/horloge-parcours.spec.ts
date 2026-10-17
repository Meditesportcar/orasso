import { expect, test } from "@playwright/test";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  createEvent,
  decideApi,
  login,
  randomPlate,
  signUpApi,
  unique,
} from "./helpers";

// Parcours qui dépendent du temps, rejoués avec l'horloge simulée (lot 34a, recette du lot 34) : place libérée offerte
// au premier de la liste d'attente, offre échue, verrouillage à H-2, pointage au début, points et malus à J+2 (malus
// contestable), bilan rafraîchi à J+8. Tout passe par les vrais services (routes de l'API, tâches rattrapées par l'horloge).
// Prérequis : API avec DEV_CLOCK=on et DEV_SKIP_2FA=true, base seedée. L'horloge avance pour TOUTE la base (les
// événements du seed passent eux aussi leurs jalons) : à lancer en dernier, puis `pnpm db:seed --reset`. L'horloge est
// remise à l'heure réelle à la fin, même en cas d'échec.
const ADMIN = "damien@orasso.local";

type Mine = {
  id: string;
  status: string;
  points: number | null;
  malus: { canContest: boolean } | null;
}[];

test("horloge simulée : offre, verrouillage H-2, pointage, J+2 (points et malus), J+8 (bilan)", async () => {
  test.setTimeout(300_000);
  const damien = await login(ADMIN);
  expect((await apiCall(damien, "POST", "/dev/clock/reset")).status).toBe(200);
  // Barème en vigueur (réglable par l'administration, lot 33 ; la recette du site « administration » le modifie).
  const settings = await apiCall<{ entries: { key: string; value: unknown }[] }>(damien, "GET", "/admin/settings");
  const setting = (key: string, fallback: number) =>
    Number(settings.data.entries?.find((e) => e.key === key)?.value ?? fallback);
  const participation = setting("points.participation", 20);
  const malus = setting("points.malus", 10);
  try {
    const ev = await createEvent(damien, { capacity: 3, title: `Horloge ${unique()}` });
    const s = unique();
    const make = async (k: string) => {
      const cookie = await signUpApi(`${k}_${s}`.slice(0, 24));
      const applicationId = await applyApi(cookie, ev.id, await addVehicleApi(cookie, randomPlate()));
      return { cookie, applicationId };
    };
    const present = await make("Present");
    const absent = await make("Absent");
    const leaver = await make("Depart");
    const waiting = await make("Attente");
    for (const a of [present, absent, leaver]) await decideApi(damien, ev.id, a.applicationId, "accept");
    await decideApi(damien, ev.id, waiting.applicationId, "waitlist");

    // « À venir » puis « Passés » (une fois l'événement fini, la candidature passe au carnet de route).
    const mine = async (who: { cookie: string; applicationId: string }) => {
      for (const scope of ["upcoming", "past"]) {
        const list = (await apiCall<Mine>(who.cookie, "GET", `/me/applications?scope=${scope}`)).data;
        const found = list.find((a) => a.id === who.applicationId);
        if (found) return found;
      }
      return undefined;
    };

    // Désistement d'un retenu → la place est offerte au premier de la liste d'attente.
    expect((await apiCall(leaver.cookie, "POST", `/applications/${leaver.applicationId}/withdraw`)).status).toBe(200);
    await expect.poll(async () => (await mine(waiting))?.status, { timeout: 15_000 }).toBe("offered");

    // H-2 : l'offre a échu (jamais après le verrouillage) et l'événement est verrouillé.
    expect((await apiCall(damien, "POST", "/dev/clock/advance", { milestone: "h-2", eventId: ev.id })).status).toBe(
      200,
    );
    await expect.poll(async () => (await mine(waiting))?.status, { timeout: 20_000 }).toBe("expired");
    const locked = await apiCall<{ isLocked: boolean }>(damien, "GET", `/events/${ev.id}`);
    expect(locked.data.isLocked).toBe(true);

    // Début : l'organisateur pointe le présent à la main ; l'absent ne vient pas.
    expect((await apiCall(damien, "POST", "/dev/clock/advance", { milestone: "start", eventId: ev.id })).status).toBe(
      200,
    );
    const checkin = await apiCall(damien, "POST", `/events/${ev.id}/checkins`, {
      applicationId: present.applicationId,
      method: "manual",
    });
    expect([200, 201]).toContain(checkin.status);

    // J+2 : règlement — participation pour le présent, malus contestable pour le retenu absent.
    expect((await apiCall(damien, "POST", "/dev/clock/advance", { milestone: "j+2", eventId: ev.id })).status).toBe(
      200,
    );
    // Le rattrapage règle tous les événements de la base passés à J+2 : jusqu'à une minute sur une base de recette.
    await expect.poll(async () => (await mine(present))?.points ?? null, { timeout: 60_000 }).toBe(participation);
    const absentAfter = await mine(absent);
    expect(absentAfter?.points).toBe(-Math.abs(malus));
    expect(absentAfter?.malus?.canContest).toBe(true);
    // Bilan provisoire calculé avec le règlement.
    const report = await apiCall<{ report: { refreshedAt: string | null; data: { present: number; absent: number } } }>(
      damien,
      "GET",
      `/events/${ev.id}/report`,
    );
    expect(report.data.report?.data).toMatchObject({ present: 1, absent: 1 });
    expect(report.data.report?.refreshedAt).toBeNull();

    // J+8 : bilan rafraîchi (définitif).
    expect((await apiCall(damien, "POST", "/dev/clock/advance", { milestone: "j+8", eventId: ev.id })).status).toBe(
      200,
    );
    await expect
      .poll(
        async () =>
          (await apiCall<{ report: { refreshedAt: string | null } | null }>(damien, "GET", `/events/${ev.id}/report`))
            .data.report?.refreshedAt ?? null,
        { timeout: 60_000 },
      )
      .not.toBeNull();
  } finally {
    await apiCall(damien, "POST", "/dev/clock/reset");
  }
});
