// Charge la configuration seule (src/env.ts) : sert au test du refus de DEV_CLOCK en production, dans un autre processus
// (le refus fait `process.exit(1)`).
import "../../src/env";

console.log("configuration acceptée");
