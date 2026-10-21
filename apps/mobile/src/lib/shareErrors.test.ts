import { describe, expect, it } from "vitest";

import { SHARE_FAILED_MESSAGE, SHARE_LIMIT_MESSAGE, SHARE_NETWORK_MESSAGE, shareErrorInfo } from "./shareErrors";

describe("erreurs de la carte à partager", () => {
  it("le limiteur, le réseau et le reste se distinguent", () => {
    expect(shareErrorInfo(429).message).toBe(SHARE_LIMIT_MESSAGE);
    expect(shareErrorInfo(null, "Request failed with status 429").message).toBe(SHARE_LIMIT_MESSAGE);
    expect(shareErrorInfo(0).message).toBe(SHARE_NETWORK_MESSAGE);
    expect(shareErrorInfo(null, "Network request failed").code).toBe("network");
    expect(shareErrorInfo(500).message).toBe(SHARE_FAILED_MESSAGE);
    expect(shareErrorInfo(null, "disque plein").message).toBe(SHARE_FAILED_MESSAGE);
  });
});
