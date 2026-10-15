import { expect, test } from "@playwright/test";
import {
  addVehicleApi,
  apiCall,
  applyApi,
  createEvent,
  login,
  loginInBrowser,
  randomPlate,
  SEED_PASSWORD,
  signUpApi,
  unique,
} from "./helpers";

// Tri de l'organisateur : trois touches, motifs, retour arrière, passer, vue liste et liste d'attente.
test("tri au clavier, vue liste et liste d'attente", async ({ browser }) => {
  const organizer = await login("damien@orasso.local");
  const event = await createEvent(organizer, { capacity: 10 });
  const suffix = unique();
  const names = ["A", "B", "C", "D"].map((l) => `${l}_${suffix}`);
  const fans: { pseudo: string; cookie: string; applicationId: string }[] = [];
  for (const pseudo of names) {
    const cookie = await signUpApi(pseudo);
    const applicationId = await applyApi(cookie, event.id, await addVehicleApi(cookie, randomPlate()));
    fans.push({ pseudo, cookie, applicationId });
  }
  const [a, b, c, d] = fans;
  if (!a || !b || !c || !d) throw new Error("fans");
  const statusOf = async (fan: (typeof fans)[number]) => {
    const res = await apiCall<{ status: string; refusalReasons: string[] | null }[]>(
      fan.cookie,
      "GET",
      "/me/applications?scope=upcoming",
    );
    return res.data.find((x) => x)?.status ?? "?";
  };

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await loginInBrowser(page, "damien@orasso.local", SEED_PASSWORD, "/app/acces");
  await page.goto(`/orga/meditesportcar/e/${event.id}/candidatures`);
  const counters = page.getByTestId("counters");
  await expect(counters).toHaveAttribute("data-live", "on");
  const message = page.getByTestId("triage-message");

  // A : liste d'attente (touche A). Les plus anciennes passent en premier.
  await expect(page.getByTestId("triage-pseudo")).toContainText(a.pseudo);
  await page.keyboard.press("a");
  await expect(message).toContainText(`${a.pseudo} : mise en liste d'attente`);
  expect(await statusOf(a)).toBe("waitlisted");

  // B : refus (R), motif « Hors thème » (touche 1), Entrée confirme.
  await expect(page.getByTestId("triage-pseudo")).toContainText(b.pseudo);
  await page.keyboard.press("r");
  await expect(page.getByTestId("refusal-panel")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("triage-message")).toContainText("Choisis au moins un motif");
  await page.keyboard.press("1");
  await page.keyboard.press("Enter");
  await expect(message).toContainText(`${b.pseudo} : refusée`);
  const refused = await apiCall<{ status: string; refusalReasons: string[] }[]>(
    b.cookie,
    "GET",
    "/me/applications?scope=upcoming",
  );
  expect(refused.data[0]?.status).toBe("refused");
  expect(refused.data[0]?.refusalReasons).toContain("off_theme");

  // Z : retour sur B, une nouvelle décision remplace la précédente (refusée → retenue).
  await page.keyboard.press("z");
  await expect(page.getByTestId("triage-pseudo")).toContainText(b.pseudo);
  await page.keyboard.press("v");
  await expect(message).toContainText(`${b.pseudo} : retenue`);
  expect(await statusOf(b)).toBe("accepted");

  // C : Espace passe sans décider (C reste à trier, D passe devant).
  await expect(page.getByTestId("triage-pseudo")).toContainText(c.pseudo);
  await page.keyboard.press(" ");
  await expect(page.getByTestId("triage-pseudo")).toContainText(d.pseudo);
  expect(await statusOf(c)).toBe("pending");

  // D : refus avec « Autre » (7) : la note est obligatoire ; Échap annule le refus, A met en liste d'attente.
  await page.keyboard.press("r");
  await page.keyboard.press("7");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("triage-message")).toContainText("ajoute une note");
  await page.keyboard.press("Escape");
  await page.keyboard.press("a");
  await expect(message).toContainText(`${d.pseudo} : mise en liste d'attente`);

  // Plus que C (passée) : elle revient en tête, V la retient.
  await expect(page.getByTestId("triage-pseudo")).toContainText(c.pseudo);
  await page.keyboard.press("v");
  await expect(message).toContainText(`${c.pseudo} : retenue`);

  // Compteurs en temps réel : 2 retenus, 0 à trier, 2 en liste d'attente.
  await expect(counters).toContainText("2");
  await expect(page.getByTestId("triage-empty")).toBeVisible();

  // Vue liste : filtre par statut, sélection multiple, décision en masse.
  await page.goto(`/orga/meditesportcar/e/${event.id}/candidatures?vue=liste&status=waitlisted`);
  await expect(page.getByTestId("triage-row")).toHaveCount(2);
  await page.getByLabel("Tout sélectionner").check();
  await expect(page.getByTestId("bulk-bar")).toContainText("2 sélectionnées");
  await page.getByTestId("bulk-bar").getByRole("button", { name: "Retenir" }).click();
  await expect(page.getByRole("status").filter({ hasText: "2 décisions enregistrées" })).toBeVisible();
  expect(await statusOf(a)).toBe("accepted");
  expect(await statusOf(d)).toBe("accepted");

  // Liste d'attente : vide après la décision en masse (l'ordre des flèches est testé dans attente.spec.ts).
  await page.goto(`/orga/meditesportcar/e/${event.id}/candidatures?vue=attente`);
  await expect(page.getByTestId("waitlist")).toContainText("Personne en liste d'attente");
  await context.close();
});
