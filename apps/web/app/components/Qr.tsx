import QRCode from "qrcode";
import { useMemo } from "react";

/**
 * QR d'inscription dessiné en SVG (correction M, version 6 attendue pour un pass `OR1…`). Toujours sombre sur clair,
 * quel que soit le thème : un QR clair sur fond sombre ne se lit pas partout. Le fond et l'encre viennent des jetons.
 */
export function Qr({ payload, label }: { payload: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = QRCode.create(payload, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    let d = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (qr.modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return { size: n, path: d };
  }, [payload]);
  const quiet = 4;
  const view = size + quiet * 2;
  return (
    <svg
      viewBox={`0 0 ${view} ${view}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      data-qr-version={Math.round((size - 17) / 4)}
    >
      <rect width={view} height={view} fill="var(--night-ink)" />
      <path d={path} transform={`translate(${quiet} ${quiet})`} fill="var(--night)" />
    </svg>
  );
}
