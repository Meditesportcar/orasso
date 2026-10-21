// Node 24 sait lire ces fichiers TypeScript ; leurs imports relatifs sans extension nécessitent ce résolveur.
// Les sondes restent de vrais processus Node, sans le démarrage de tsx (userInfo indisponible dans certains bacs à sable).
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND" || !specifier.startsWith(".") || /\.[a-z]+$/i.test(specifier))
        throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});
