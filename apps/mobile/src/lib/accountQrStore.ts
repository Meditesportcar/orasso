// Le secret du QR de compte reste dans le trousseau sécurisé de l'appareil (expo-secure-store).
import type { AccountQrSecret } from "@orasso/shared";

import { kvDel, kvGetJson, kvSetJson } from "./kv";

const KEY = "account-qr-secret";

export const loadAccountQrSecret = () => kvGetJson<AccountQrSecret>(KEY);
export const saveAccountQrSecret = (secret: AccountQrSecret) => kvSetJson(KEY, secret);
export const clearAccountQrSecret = () => kvDel(KEY);
