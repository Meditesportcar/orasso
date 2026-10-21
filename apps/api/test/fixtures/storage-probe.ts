// L'environnement externe est posé par le parent ; setup-process doit l'écraser avant l'import de src/.
await import("../setup-process");
const { storage, storageDir } = await import("../../src/lib/storage");
const [command, key, value] = process.argv.slice(2);
if (!key) throw new Error("Clé manquante");
if (command === "put") await storage.put(key, Buffer.from(value ?? ""));
else if (command === "remove") await storage.remove(key);
else throw new Error("Commande inconnue");
console.log(JSON.stringify({ storageDir, data: (await storage.get(key))?.toString() ?? null }));
