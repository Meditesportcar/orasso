// Metro : configuration par défaut d'Expo (monorepo compris), plus le moteur WebAssembly d'expo-sqlite comme
// ressource (recette du mode staff dans un navigateur, voir scripts/web-isolated.mjs pour les en-têtes d'isolation).
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("wasm");

module.exports = config;
