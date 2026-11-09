import { expect, test } from "@playwright/test";
import { cutWords, expectCutWordsDetected } from "./cutWords";
import { apiCall, login, loginInBrowser } from "./helpers";

// Lot R7j (D38), côté site : les souvenirs « il y a un an… ». Le seed `memories` pose, le jour où on le lance, un événement
// et un tampon d'il y a exactement un an pour Damien_66. Vérifie : le bloc « Souvenirs » de l'Accueil le jour même, la page
// du souvenir (tampon, récap, pas de plaque), la carte du Fil, un compte sans tampon (rien, et 404 sur la page), et, avec
// l'horloge simulée (+1 jour), le bloc absent le lendemain. Prérequis : base seedée le jour même, API (DEV_CLOCK=on) et
// site lancés. L'horloge est remise à l'heure réelle à la fin.
type Today = {
  eventId: string;
  title: string;
  yearsAgo: number;
  photoUrl: string | null;
  posterUrl: string | null;
  car: { label: string; rank: number; total: number } | null;
}[];

type Home = { memories: { items: Today } | null };

test("souvenir du jour : bloc de l'Accueil, page, carte du Fil ; rien pour un compte sans tampon ; absent le lendemain", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const cookie = await login("damien@orasso.local");
  await apiCall(cookie, "PUT", "/me/home/widgets", { order: [], hidden: [] });
  const today = (await apiCall<Today>(cookie, "GET", "/me/memories/today")).data;
  expect(today.length).toBeGreaterThan(0);
  const memory = today[0]!;
  expect(memory.yearsAgo).toBe(1);
  // Jamais de plaque : l'URL de la photo est celle de la règle du plateau (ou l'affiche), jamais l'original.
  expect(memory.photoUrl ?? "").not.toContain("scirocco-plaque-lisible");

  try {
    await loginInBrowser(page, "damien@orasso.local", undefined, "/app");
    const block = page.getByTestId("widget-memories");
    await expect(block).toBeVisible();
    await expect(block).toContainText("Souvenirs");
    await expect(block).toContainText("Il y a un an, jour pour jour");
    await expect(block).toContainText(`Tu étais là : ${memory.title}`);
    // La carte suit la maquette : le tampon, « Le plateau » en secondaire, la ligne de ma voiture ; pas de « En story » (R7f4).
    await expect(block.getByTestId("home-memory-open")).toBeVisible();
    await expect(block.getByTestId("home-memory-stamp")).toBeVisible();
    await expect(block.getByTestId("home-memory-plateau")).toBeVisible();
    if (memory.car) {
      await expect(block.getByTestId("home-memory-car")).toContainText(`n° ${memory.car.rank} du plateau`);
    }
    // Le contrôle voit-il un mot coupé ? (témoin volontaire), puis les vrais titres.
    await expectCutWordsDetected(page);
    expect(await cutWords(page, "home-memory-title")).toEqual([]);
    await expect(page.getByText("En story")).toHaveCount(0);

    await block.getByTestId("home-memory-open").click();
    await expect(page).toHaveURL(new RegExp(`/app/souvenir/${memory.eventId}`));
    const hero = page.getByTestId("memory-hero");
    await expect(hero).toContainText("Il y a un an, jour pour jour");
    await expect(page.getByTestId("memory-title")).toHaveText(`Tu étais là : ${memory.title}`);
    expect(await cutWords(page, "memory-title")).toEqual([]);
    await expect(page.getByTestId("memory-stamp-tile")).toContainText("Ton tampon");
    await expect(page.getByTestId("memory-stamp-tile")).toContainText("Posé le");
    await expect(page.getByTestId("memory-event")).toBeVisible();
    await expect(page.getByText("En story")).toHaveCount(0);

    // La carte du Fil, onglet « Pour toi » : visible de moi seul.
    await page.goto("/app/fil");
    await expect(page.getByTestId("feed-memory-open").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("feed-memory-stamp").first()).toBeVisible();
    await expect(page.getByTestId("feed-memory-plateau").first()).toBeVisible();

    // Un identifiant invalide : la même page « pas disponible », pas une erreur 400.
    await page.goto("/app/souvenir/pas-un-uuid");
    await expect(page.getByTestId("memory-unavailable")).toHaveText("Ce souvenir n'est pas disponible.");

    // Un compte sans tampon d'il y a un an : rien dans l'Accueil, la page répond « pas disponible ».
    const kenji = await login("kenji@orasso.local");
    expect((await apiCall<Home>(kenji, "GET", "/me/home")).data.memories).toBeNull();
    expect((await apiCall(kenji, "GET", `/me/memories/${memory.eventId}`)).status).toBe(404);
    const other = await page.context().browser()?.newContext();
    if (other) {
      const p2 = await other.newPage();
      await loginInBrowser(p2, "kenji@orasso.local", undefined, "/app");
      await expect(p2.getByTestId("widget-memories")).toHaveCount(0);
      await p2.goto(`/app/souvenir/${memory.eventId}`);
      await expect(p2.getByTestId("memory-unavailable")).toHaveText("Ce souvenir n'est pas disponible.");
      await expect(p2.getByTestId("memory-hero")).toHaveCount(0);
      await other.close();
    }

    // Le lendemain (horloge simulée) : plus de souvenir d'« il y a un an » pour ce tampon, le bloc disparaît.
    expect((await apiCall(cookie, "POST", "/dev/clock/advance", { by: "1d" })).status).toBe(200);
    await expect
      .poll(async () => (await apiCall<Home>(cookie, "GET", "/me/home")).data.memories, { timeout: 20_000 })
      .toBeNull();
    await page.goto("/app");
    await expect(page.getByTestId("widget-memories")).toHaveCount(0);
    // La page, elle, reste ouverte (seulement fermée avant un an) : un lien de notification d'hier marche encore.
    expect((await apiCall(cookie, "GET", `/me/memories/${memory.eventId}`)).status).toBe(200);
    // Ouverte le lendemain, la page ne dit plus « jour pour jour » : une formule datée.
    await page.goto(`/app/souvenir/${memory.eventId}`);
    await expect(page.getByTestId("memory-eyebrow")).toContainText("Il y a un an, le ");
    await expect(page.getByTestId("memory-eyebrow")).not.toContainText("jour pour jour");
  } finally {
    await apiCall(cookie, "POST", "/dev/clock/reset");
  }
});
