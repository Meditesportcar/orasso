import { expect, test } from "@playwright/test";
import { addPendingSecondPlace, apiCall, login, loginInBrowser } from "./helpers";

// Lot R7a2 (D38), côté site : l'Accueil « tableau de bord » et « Personnaliser ». Damien_66 est retenu et entré au
// « Rassemblement du Lydia » (seed `live-event`) : la ligne « En cours », le bloc « En cours » et « Voter » ; Paul_Photo (hors
// événement) : le réglage par défaut. Vérifie : l'ordre réglé est respecté, un bloc masqué est absent et n'est pas demandé
// (la réponse de l'API le dit), « Remettre par défaut », « Ajouter », et que « En cours » n'apparaît que pendant l'événement.
// Prérequis : base locale avec le seed, API et site lancés (comme `accueil.spec.ts`).
type Home = {
  widgets: { order: string[]; hidden: string[] };
  live: { dayIndex: number; votes: { open: number } } | null;
  myOutings: { items: unknown[] } | null;
  myCrew: unknown;
  friendsNews: unknown;
};
const DEFAULT = { order: [], hidden: ["agenda", "favorite_garage", "pending"] };

async function domOrder(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="widget-"]')].map((el) =>
      (el.getAttribute("data-testid") ?? "").replace("widget-", ""),
    ),
  );
}

test("Accueil pendant l'événement : ligne et bloc « En cours », « Voter » en bouton principal", async ({ page }) => {
  const cookie = await login("damien@orasso.local");
  await apiCall(cookie, "PUT", "/me/home/widgets", DEFAULT);
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app");

  const line = page.getByTestId("home-live-line");
  await expect(line).toContainText(/En cours · jour \d sur \d/i);
  await expect(line).toContainText("Rassemblement du Lydia");
  // Un vote est ouvert : « Voter » est le bouton principal, « Mon accès » passe au trait.
  await expect(page.getByTestId("home-live-vote")).toBeVisible();
  await expect(page.getByTestId("widget-live")).toContainText("sur place");
  await expect(page.getByTestId("widget-live").getByTestId("home-live-program")).toBeVisible();
  // L'ordre par défaut : En cours, Mes sorties, Mon crew, Du nouveau chez tes potes.
  const order = await domOrder(page);
  expect(order.slice(0, 4)).toEqual(["live", "my_outings", "my_crew", "friends_news"]);
  // Le bandeau « Personnaliser » est là, en haut et en bas.
  await expect(page.getByTestId("home-personalize")).toBeVisible();
  await expect(page.getByTestId("home-personalize-bottom")).toBeVisible();
});

test("ordre réglé respecté ; un bloc masqué est absent et n'est pas calculé", async ({ page }) => {
  const cookie = await login("damien@orasso.local");
  await apiCall(cookie, "PUT", "/me/home/widgets", {
    order: ["next_access", "live", "my_crew", "my_outings", "nearby"],
    hidden: ["friends_news", "agenda", "favorite_garage", "pending"],
  });
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
  const order = await domOrder(page);
  expect(order.indexOf("my_crew")).toBeLessThan(order.indexOf("my_outings"));
  await expect(page.getByTestId("widget-friends_news")).toHaveCount(0);
  const home = (await apiCall<Home>(cookie, "GET", "/me/home")).data;
  expect(home.friendsNews).toBeNull();
  expect(home.myCrew).not.toBeNull();
  await apiCall(cookie, "PUT", "/me/home/widgets", DEFAULT);
});

test("Personnaliser : monter, masquer, ajouter, remettre par défaut ; le réglage est gardé sur le compte", async ({
  page,
}) => {
  const cookie = await login("damien@orasso.local");
  await apiCall(cookie, "PUT", "/me/home/widgets", DEFAULT);
  await loginInBrowser(page, "damien@orasso.local", undefined, "/app/accueil/personnaliser");
  await page.goto("/app/accueil/personnaliser");
  // « Prochaine sortie » en tête, grisée ; « Défis de la saison » grisé « Bientôt ».
  await expect(page.getByTestId("personalize-row-next_access")).toContainText("Toujours en tête");
  await expect(page.getByTestId("personalize-soon")).toContainText("Bientôt");
  await expect(page.getByTestId("up-live")).toBeDisabled();

  await page.getByTestId("up-my_crew").click();
  await expect
    .poll(async () => {
      const o = (await apiCall<Home>(cookie, "GET", "/me/home")).data.widgets.order;
      return o.indexOf("my_crew") < o.indexOf("my_outings");
    })
    .toBe(true);
  await page.getByTestId("hide-friends_news").click();
  await expect
    .poll(async () => (await apiCall<Home>(cookie, "GET", "/me/home")).data.widgets.hidden)
    .toContain("friends_news");
  await page.getByTestId("add-agenda").click();
  await expect
    .poll(async () => (await apiCall<Home>(cookie, "GET", "/me/home")).data.widgets.hidden)
    .not.toContain("agenda");

  await page.getByTestId("reset").click();
  await expect
    .poll(async () => (await apiCall<Home>(cookie, "GET", "/me/home")).data.widgets)
    .toEqual({
      order: expect.any(Array),
      hidden: ["agenda", "favorite_garage", "pending"],
    });
  const widgets = (await apiCall<Home>(cookie, "GET", "/me/home")).data.widgets;
  expect(widgets.order.slice(0, 6)).toEqual([
    "next_access",
    "live",
    "my_outings",
    "my_crew",
    "friends_news",
    "spot_meetup",
  ]);
});

test("hors événement : pas de bloc « En cours », le réglage par défaut", async ({ page }) => {
  const cookie = await login("paul.photo@orasso.local");
  const home = (await apiCall<Home>(cookie, "GET", "/me/home")).data;
  expect(home.live).toBeNull();
  expect(home.widgets.hidden).toEqual(["agenda", "favorite_garage", "pending"]);
  await loginInBrowser(page, "paul.photo@orasso.local", undefined, "/app");
  await expect(page.getByTestId("home-live-line")).toHaveCount(0);
  await expect(page.getByTestId("widget-live")).toHaveCount(0);
  await expect(page.getByTestId("widget-agenda")).toHaveCount(0);
});

// --- Tour 3 -------------------------------------------------------------------------------------------------------------
test("tour 3 : présence seule (sans place ni billet) : la ligne « En cours » n'a pas de « Mon accès »", async ({
  page,
}) => {
  const cookie = await login("pilote5@orasso.local");
  const home = (await apiCall<{ live: { hasPlace: boolean } | null }>(cookie, "GET", "/me/home")).data;
  expect(home.live?.hasPlace).toBe(false);
  await loginInBrowser(page, "pilote5@orasso.local", undefined, "/app");
  await expect(page.getByTestId("home-live-line")).toBeVisible();
  await expect(page.getByTestId("home-live-access")).toHaveCount(0);
});

test("tour 3 : une ligne à deux véhicules de statuts différents ; Réinitialiser aux défauts du compte", async ({
  page,
}) => {
  const cookie = await login("damien@orasso.local");
  const remove = await addPendingSecondPlace();
  try {
    expect(remove).not.toBeNull();
    await apiCall(cookie, "PUT", "/me/home/widgets", DEFAULT);
    await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
    const line = page.getByTestId("home-my-outing").filter({ hasText: "Rassemblement du Lydia" });
    await expect(line).toContainText("(en attente)");
    const detail = (await line.innerText()).split("\n").find((x) => x.includes("(en attente)")) ?? "";
    expect(detail.split(" · ").filter((x) => x.includes("(en attente)"))).toHaveLength(1);
    if (process.env.CAPTURES_DIR)
      await page.screenshot({ path: `${process.env.CAPTURES_DIR}/site-mes-sorties-deux-vehicules.png` });

    // Réinitialiser : les défauts du compte, réglage effacé côté API.
    await apiCall(cookie, "PUT", "/me/home/widgets", { order: ["next_access", "weather"], hidden: ["friends_news"] });
    await page.goto("/app/accueil/personnaliser");
    await page.getByTestId("reset").click();
    await expect
      .poll(async () => (await apiCall<Home>(cookie, "GET", "/me/home")).data.widgets.hidden)
      .toEqual(["agenda", "favorite_garage", "pending"]);
    const settings = (await apiCall<{ homeWidgets: unknown }>(cookie, "GET", "/me/settings")).data;
    expect(settings.homeWidgets).toBeNull();
  } finally {
    await remove?.();
    await apiCall(cookie, "PUT", "/me/home/widgets", DEFAULT);
  }
});
