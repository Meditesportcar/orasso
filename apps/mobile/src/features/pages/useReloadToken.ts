// Relire les listes d'une page (publications, mentions) au geste « tirer pour recharger » et au retour sur l'écran (depuis la
// publication ouverte, par exemple). Le jeton change : les listes montées avec lui dans leur clé repartent d'une lecture neuve.
// Le retour se lit dans l'adresse courante : elle quitte celle de la page, puis y revient (la page reste montée sous la pile).
// Le premier affichage ne compte pas (les listes se lisent à leur montage).
import { usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";

export function useReloadToken(): [number, () => void] {
  const [token, setToken] = useState(0);
  const pathname = usePathname();
  const own = useRef(pathname);
  const away = useRef(false);
  useEffect(() => {
    if (pathname !== own.current) {
      away.current = true;
    } else if (away.current) {
      away.current = false;
      setToken((n) => n + 1);
    }
  }, [pathname]);
  return [token, () => setToken((n) => n + 1)];
}
