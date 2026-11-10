import { expect, type Page } from "@playwright/test";

/**
 * Lot R8x : l'onglet « Événements · N » dit le nombre de la liste. Attend que N soit connu et égal au nombre de cartes
 * (`event-row` dans l'appli, `event-tile` sur le site) : la preuve que la liste s'est rechargée pour le lieu, le texte et
 * les filtres demandés. Avec « Voir plus » (plus d'une page), N est au moins le nombre de cartes montrées.
 */
export async function tabMatchesList(page: Page, rows: "event-row" | "event-tile" = "event-row"): Promise<void> {
  await expect
    .poll(
      async () => {
        const label = await page.getByTestId("segment-evenements").innerText();
        const n = Number(/Événements · (\d+)/.exec(label)?.[1] ?? "NaN");
        if (Number.isNaN(n)) return false;
        const shown = await page.getByTestId(rows).count();
        const more = await page.getByText("Voir plus", { exact: true }).count();
        return more > 0 ? n >= shown : n === shown;
      },
      { timeout: 30_000, intervals: [500] },
    )
    .toBe(true);
}
