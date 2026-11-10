import { describe, expect, it } from "vitest";
import { parseByteRange } from "./range";

describe("en-tête Range", () => {
  it("lit un intervalle fermé, ouvert et un suffixe", () => {
    expect(parseByteRange("bytes=0-99", 1000)).toEqual({ start: 0, end: 99 });
    expect(parseByteRange("bytes=500-", 1000)).toEqual({ start: 500, end: 999 });
    expect(parseByteRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=-5000", 1000)).toEqual({ start: 0, end: 999 });
  });

  it("ramène la fin au dernier octet", () => {
    expect(parseByteRange("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=999-999", 1000)).toEqual({ start: 999, end: 999 });
  });

  it("refuse (416) un intervalle hors du fichier", () => {
    expect(parseByteRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=5000-6000", 1000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=-0", 1000)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=0-10", 0)).toBe("unsatisfiable");
  });

  it("ignore ce qui n'est pas un intervalle simple : tout le fichier est rendu", () => {
    expect(parseByteRange(undefined, 1000)).toBeNull();
    expect(parseByteRange("", 1000)).toBeNull();
    expect(parseByteRange("items=0-1", 1000)).toBeNull();
    expect(parseByteRange("bytes=0-1,5-6", 1000)).toBeNull();
    expect(parseByteRange("bytes=-", 1000)).toBeNull();
    expect(parseByteRange("bytes=abc-", 1000)).toBeNull();
    expect(parseByteRange("bytes=9-2", 1000)).toBeNull();
    expect(parseByteRange("bytes=0-99999999999999999999", 1000)).toBeNull();
  });
});
