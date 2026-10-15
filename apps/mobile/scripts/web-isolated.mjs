// Recette web du mode staff : expo-sqlite tourne en WebAssembly et exige une page « isolée » (SharedArrayBuffer),
// donc les en-têtes COOP/COEP sur la page elle-même. Le serveur de dev d'Expo sert la page HTML avant Metro et ne
// permet pas de les ajouter : ce relais les pose sur tout ce qu'il transmet (WebSocket du rechargement compris).
//   node apps/mobile/scripts/web-isolated.mjs <port public> <port d'expo start --web>
import http from "node:http";
import net from "node:net";

const [publicPort = "8101", expoPort = "8102"] = process.argv.slice(2);
const target = { host: "127.0.0.1", port: Number(expoPort) };

const server = http.createServer((req, res) => {
  const upstream = http.request({ ...target, method: req.method, path: req.url, headers: req.headers }, (up) => {
    res.writeHead(up.statusCode ?? 502, {
      ...up.headers,
      "cross-origin-opener-policy": "same-origin",
      // `credentialless` : les images de l'API (autre port) restent lisibles sans en-tête CORP.
      "cross-origin-embedder-policy": "credentialless",
    });
    up.pipe(res);
  });
  upstream.on("error", () => {
    res.writeHead(502);
    res.end("Expo n'est pas démarré");
  });
  req.pipe(upstream);
});

server.on("upgrade", (req, socket, head) => {
  const up = net.connect(target.port, target.host, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    up.write(`${lines.join("\r\n")}\r\n\r\n`);
    up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  up.on("error", () => socket.destroy());
  socket.on("error", () => up.destroy());
});

server.listen(Number(publicPort), () => {
  console.log(`Page isolée : http://localhost:${publicPort} → expo sur ${expoPort}`);
});
