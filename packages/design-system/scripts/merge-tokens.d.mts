// Types de merge-tokens.mjs (lu par src/tokens.test.ts).

// biome-ignore lint/suspicious/noExplicitAny: JSON des jetons, de forme libre comme le résultat de JSON.parse
export type TokenJson = Record<string, any>;

export type OverlayChange = {
  kind: "changed" | "added";
  group: string;
  name: string;
  before?: Record<string, string>;
  value: Record<string, string>;
  why?: string;
};

export const BASE_PATH: string;
export const OVERLAY_PATH: string;

export function mergeTokens(base: TokenJson, overlay: TokenJson): { json: TokenJson; changes: OverlayChange[] };

export function loadMergedTokens(): {
  base: TokenJson;
  overlay: TokenJson;
  json: TokenJson;
  changes: OverlayChange[];
};
