import { base64UrlDecode, ROTATING_STEP_SECONDS, rotatingCodeForSlot, rotatingSlot, secondsLeft } from "@orasso/shared";
import { useEffect, useMemo, useState } from "react";

import { Qr } from "./Qr";

/**
 * Code d'accès tournant `OR2` sur le site (relecture du lot 48, même code que l'appli, prototype `s-qr`) : nouveau code
 * signé toutes les 20 s avec le secret du pass, anneau qui se vide, « Nouveau code dans N s ». L'ancien QR statique
 * n'est jamais montré à un pass qui a un secret (une capture vaudrait accès). L'heure est celle du serveur : `serverTime`
 * (heure du rendu côté serveur) recale l'horloge du navigateur au chargement. Rien avant l'hydratation (pas de code figé
 * dans le HTML).
 */
export function RotatingQr({
  secret,
  eventNo,
  passId,
  serverTime,
  label,
}: {
  secret: string;
  eventNo: number;
  passId: string;
  serverTime: string;
  label: string;
}) {
  const [skew] = useState(() => (typeof window === "undefined" ? 0 : Date.parse(serverTime) - Date.now()));
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now() + skew);
    const timer = setInterval(() => setNow(Date.now() + skew), 1000);
    return () => clearInterval(timer);
  }, [skew]);
  const slot = now === null ? null : rotatingSlot(new Date(now));
  const code = useMemo(() => {
    const key = base64UrlDecode(secret);
    return key && slot !== null ? rotatingCodeForSlot(key, { eventNo, passId, slot }) : null;
  }, [secret, eventNo, passId, slot]);
  if (now === null || !code) return <div className="acc__qr-wait" aria-busy="true" />;
  const left = secondsLeft(new Date(now));
  return (
    <div className="acc__rotating" data-testid="rotating-qr">
      <div className="acc__ring" style={{ "--ring-left": left / ROTATING_STEP_SECONDS } as React.CSSProperties}>
        <Qr payload={code} label={label} />
      </div>
      <p className="o-t-caption s-center" data-testid="rotating-countdown">
        Nouveau code dans <strong>{left} s</strong> · n° {slot === null ? "" : slot % 10_000}
      </p>
    </div>
  );
}
