// Frontière des feuilles (partie C du petit lot de fin) : une feuille part à la zone des feuilles de l'écran, sauf dans une
// frontière (Modal natif, `overlays`) ou sans zone. Le rendu serveur n'exécute pas les effets : ce que `<Overlay>` envoie à
// la zone n'apparaît donc pas sur place, ce qui reste sur place apparaît.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { OverlayProvider, SheetBoundary, SheetPortal } from "./Overlay";

const sheet = <SheetPortal>feuille</SheetPortal>;

describe("SheetPortal et SheetBoundary", () => {
  it("sous la zone d'un écran, la feuille part à la zone (rien sur place)", () => {
    expect(renderToStaticMarkup(<OverlayProvider>{sheet}</OverlayProvider>)).toBe("");
  });
  it("dans une frontière (Modal), la feuille reste dans la fenêtre", () => {
    expect(
      renderToStaticMarkup(
        <OverlayProvider>
          <SheetBoundary>{sheet}</SheetBoundary>
        </OverlayProvider>,
      ),
    ).toBe("feuille");
  });
  it("sans zone d'écran, la feuille reste sur place", () => {
    expect(renderToStaticMarkup(sheet)).toBe("feuille");
  });
});
