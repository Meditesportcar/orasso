import { describe, expect, it } from "vitest";

import { convertAll, holdLock, PREPARE_FAILED } from "./prepare";

describe("préparation des photos du composeur (lot R7e2, tour 5)", () => {
  it("une conversion qui échoue à la deuxième photo libère la première et rend l'erreur", async () => {
    const released: string[] = [];
    await expect(
      convertAll(
        ["a", "b", "c"],
        async (s) => {
          if (s === "b") throw new Error("illisible");
          return `url-${s}`;
        },
        (u) => released.push(u),
      ),
    ).rejects.toThrow("illisible");
    expect(released).toEqual(["url-a"]);
  });
  it("sans échec, rien n'est libéré", async () => {
    const released: string[] = [];
    expect(
      await convertAll(
        ["a", "b"],
        async (s) => s,
        (u) => released.push(u),
      ),
    ).toEqual(["a", "b"]);
    expect(released).toEqual([]);
  });
  it("le verrou est libéré après un échec, l'erreur est affichée, et l'opération suivante repart", async () => {
    const states: boolean[] = [];
    const errors: string[] = [];
    await holdLock(
      (l) => states.push(l),
      async () => {
        throw new Error("conversion en échec");
      },
      (m) => errors.push(m),
    );
    expect(states).toEqual([true, false]);
    expect(errors).toEqual([PREPARE_FAILED]);
    let ran = false;
    await holdLock(
      (l) => states.push(l),
      async () => {
        ran = true;
      },
      (m) => errors.push(m),
    );
    expect(ran).toBe(true);
    expect(states).toEqual([true, false, true, false]);
    expect(errors).toHaveLength(1);
  });
});
