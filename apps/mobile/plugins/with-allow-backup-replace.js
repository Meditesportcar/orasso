// Plugin de configuration Expo (mise en ligne de la vague R7, 10/11/2026). `react-native-compressor` (stories vidéo, lot R7g)
// tire la bibliothèque TAndroidLame, dont le manifeste déclare `android:allowBackup="true"`. Orasso le veut à `false`
// (`app.json` : la session est gardée dans le trousseau, rien ne part dans une sauvegarde Android). Sans `tools:replace`,
// l'assemblage du manifeste échoue (`processReleaseMainManifest`) : la valeur de l'application l'emporte ainsi.
const { withAndroidManifest } = require("expo/config-plugins");

module.exports = function withAllowBackupReplace(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$ = manifest.$ ?? {};
    manifest.$["xmlns:tools"] = manifest.$["xmlns:tools"] ?? "http://schemas.android.com/tools";
    const app = manifest.application?.[0];
    if (app) {
      app.$ = app.$ ?? {};
      const replaced = (app.$["tools:replace"] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!replaced.includes("android:allowBackup")) replaced.push("android:allowBackup");
      app.$["tools:replace"] = replaced.join(",");
    }
    return cfg;
  });
};
