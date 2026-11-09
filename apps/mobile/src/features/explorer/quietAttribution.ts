// Attribution des tuiles réduite (lot R7i, tour 2) : sur la carte du lieu d'un rendez-vous, le crédit reste (obligatoire) mais
// se replie sur sa pastille « i » dans le coin, en petit, au lieu de couvrir la carte. Navigateur seulement : le natif place le
// bouton d'attribution par `attributionPosition`.
type MapEvents = { once: (event: "load" | "idle", handler: () => void) => unknown };

export function quietAttribution(map: MapEvents, box: HTMLElement): void {
  const collapse = () => {
    const el = box.querySelector<HTMLElement>(".maplibregl-ctrl-attrib");
    if (!el) return;
    el.classList.remove("maplibregl-compact-show");
    el.removeAttribute("open");
    el.style.fontSize = "9px";
  };
  map.once("load", collapse);
  map.once("idle", collapse);
  window.setTimeout(collapse, 1_500);
}
