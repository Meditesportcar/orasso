// QR de compte sur le site (lot 30, ARCHITECTURE.md § 3.3) : le même code que dans l'appli. Le secret vient de
// `GET /me/account-qr-secret` (chargé côté serveur, page jamais mise en cache) ; le code à 8 chiffres (HOTP, compteur =
// minutes Unix) est calculé ici, dans le navigateur, avec WebCrypto, et se redessine toutes les 60 s. Un pro le lit avec
// son lecteur (lot 14). Le secret ne sert qu'à cela : il n'est ni affiché ni envoyé ailleurs.
import { Plate } from "@orasso/design-system/web";
import {
  ACCOUNT_QR_STEP_SECONDS,
  type AccountQrSecret,
  accountQrCounter,
  base64UrlDecode,
  counterBytes,
  encodeAccountQrPayload,
  homeLabels,
  hotpFromDigest,
} from "@orasso/shared";
import { useEffect, useState } from "react";

import { Qr } from "./Qr";

/** Condensé HMAC-SHA1 du compteur, par WebCrypto (HTTPS ou localhost seulement). */
async function digest(key: CryptoKey, counter: number): Promise<Uint8Array> {
  const buffer = await crypto.subtle.sign("HMAC", key, counterBytes(counter) as BufferSource);
  return new Uint8Array(buffer);
}

export function AccountQr({ secret }: { secret: AccountQrSecret }) {
  const [payload, setPayload] = useState<string | null>(null);
  const [left, setLeft] = useState<number>(ACCOUNT_QR_STEP_SECONDS);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const raw = base64UrlDecode(secret.secret);
    const shortId = base64UrlDecode(secret.shortId);
    if (!raw || !shortId || !globalThis.crypto?.subtle) {
      setUnavailable(true);
      return;
    }
    // État propre à ce passage de l'effet (le mode développement en joue deux d'affilée) : rien n'est partagé avec un
    // passage annulé, qui ne doit ni empêcher le recalcul ni laisser tourner sa minuterie.
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let key: CryptoKey | null = null;
    let last = -1;
    (async () => {
      try {
        key = await crypto.subtle.importKey("raw", raw as BufferSource, { name: "HMAC", hash: "SHA-1" }, false, [
          "sign",
        ]);
      } catch {
        if (!cancelled) setUnavailable(true);
        return;
      }
      if (cancelled) return;
      const tick = async () => {
        const now = new Date();
        const counter = accountQrCounter(now);
        setLeft(ACCOUNT_QR_STEP_SECONDS - (Math.floor(now.getTime() / 1000) % ACCOUNT_QR_STEP_SECONDS));
        if (counter === last || !key) return;
        last = counter;
        const code = hotpFromDigest(await digest(key, counter));
        if (!cancelled) setPayload(encodeAccountQrPayload(shortId, code));
      };
      await tick();
      if (!cancelled) timer = setInterval(() => void tick(), 1000);
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [secret.secret, secret.shortId]);

  return (
    <Plate className="aq" data-testid="account-qr">
      <h2 className="o-t-label">{homeLabels.accountQrTitle}</h2>
      {unavailable ? (
        <p role="status">{homeLabels.accountQrUnavailable}</p>
      ) : payload ? (
        <>
          <div className="aq__code" data-testid="account-qr-code" data-payload={payload}>
            <Qr payload={payload} label={homeLabels.accountQrTitle} />
          </div>
          <div className="aq__bar" aria-hidden="true">
            <span style={{ width: `${(left / ACCOUNT_QR_STEP_SECONDS) * 100}%` }} />
          </div>
          <p className="o-t-caption" aria-live="off">
            {homeLabels.accountQrSecondsLeft(left)}
          </p>
        </>
      ) : (
        <p role="status">…</p>
      )}
      <p className="o-t-meta">{homeLabels.accountQrHint}</p>
      <p className="o-t-caption" data-testid="account-qr-warning">
        {homeLabels.accountQrWarning}
      </p>
    </Plate>
  );
}
