import { describe, expect, it } from "vitest";

import { createScrollRelay, rootMarginFor, seenIn, usefulZone } from "./sponsoredZone";

describe("zone utile du site", () => {
  it("va du bas de la barre du haut au haut des onglets", () => {
    expect(usefulZone(64, 800, 900)).toEqual({ top: 64, bottom: 800 });
    expect(usefulZone(null, null, 900)).toEqual({ top: 0, bottom: 900 });
    expect(rootMarginFor({ top: 64, bottom: 800 }, 900)).toBe("-64px 0px -100px 0px");
  });

  it("ne compte pas une carte de 600 px dont 300 px sont dans la fenêtre, 80 sous les onglets", () => {
    const zone = usefulZone(0, 820, 900);
    // fenêtre 900, onglets en 820, carte du haut à 600 : 300 px dans la fenêtre, 220 dans la zone (moins de 50 %)
    expect(seenIn(600, 600, { top: 0, bottom: 900 })).toBe(true); // la fenêtre entière la compterait (300 = 50 %)
    expect(seenIn(600, 600, zone)).toBe(false);
    expect(seenIn(520, 600, zone)).toBe(true); // 300 px dans la zone
  });
});

describe("relais du défilement pour une très grande carte", () => {
  const run = (tops: number[]) => {
    const zone = { top: 0, bottom: 250 };
    let i = 0;
    const log: string[] = [];
    const relay = createScrollRelay({
      measure: () => ({ top: tops[Math.min(i++, tops.length - 1)] ?? 0, height: 850, zone }),
      onSeen: () => log.push("vue"),
      onActive: (a) => log.push(a ? "écoute" : "fin"),
    });
    return { relay, log };
  };

  it("compte une carte de 850 px dans une zone de 250 px dès que la zone est remplie (30 % plafonné)", () => {
    expect(seenIn(0, 850, { top: 0, bottom: 250 })).toBe(true);
    expect(seenIn(10, 850, { top: 0, bottom: 250 })).toBe(false);
    const { relay, log } = run([100, 0]);
    relay.touch();
    relay.tick(); // top 100 : 150 px visibles
    relay.tick(); // top 0 : 250 px = la zone entière
    expect(log).toEqual(["écoute", "fin", "vue"]);
  });

  it("s'arrête quand la carte sort de la zone sans avoir été vue", () => {
    const { relay, log } = run([100, 260]);
    relay.touch();
    relay.tick();
    relay.tick();
    expect(log).toEqual(["écoute", "fin"]);
    expect(relay.isActive()).toBe(false);
  });
});
