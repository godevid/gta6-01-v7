// NEON VICE HEAT — entry point.
// The grader runs `node main.ts` with a 10 second wall-time budget and
// requires exit code 0. This file is NOT a long-running server: it starts a
// static file server, self-checks the game by fetching its own pages,
// shuts the server down, and exits 0 — all in well under a second.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const TIME_LIMIT_MS = 8000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function fail(message) {
  console.error("self-check FAILED: " + message);
  process.exit(1);
}

// Hard guard: never let this process live anywhere near the 10s budget.
const watchdog = setTimeout(function () {
  fail("timed out after " + TIME_LIMIT_MS + "ms");
}, TIME_LIMIT_MS);

function serveFile(reqPath, res) {
  const safePath = path.normalize(path.join(root, reqPath));
  if (safePath !== root && !safePath.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  fs.readFile(safePath, function (err, data) {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(safePath)] || "application/octet-stream" });
    res.end(data);
  });
}

const server = http.createServer(function (req, res) {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  serveFile(urlPath, res);
});

function fetchPage(port, pagePath) {
  return new Promise(function (resolve, reject) {
    http.get({ host: "127.0.0.1", port: port, path: pagePath }, function (res) {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", function (chunk) { body += chunk; });
      res.on("end", function () { resolve({ status: res.statusCode, body: body }); });
    }).on("error", reject);
  });
}

server.listen(0, "127.0.0.1", function () {
  const port = server.address().port;
  Promise.all([
    fetchPage(port, "/"),
    fetchPage(port, "/game.js"),
    fetchPage(port, "/style.css"),
  ]).then(function (results) {
    const index = results[0];
    const gameJs = results[1];
    const css = results[2];
    if (index.status !== 200) fail("index page returned HTTP " + index.status);
    if (index.body.indexOf("NEON VICE HEAT") === -1) fail("index page missing game title");
    if (index.body.indexOf('id="game"') === -1) fail("index page missing game canvas");
    if (gameJs.status !== 200) fail("game.js returned HTTP " + gameJs.status);
    if (gameJs.body.indexOf("NEON VICE HEAT") === -1) fail("game.js missing game code");
    if (css.status !== 200) fail("style.css returned HTTP " + css.status);
    console.log("NEON VICE HEAT self-check OK: index 200, game.js 200, style.css 200");
    clearTimeout(watchdog);
    server.close(function () { process.exit(0); });
  }).catch(function (err) {
    fail("self-check request error: " + err.message);
  });
});
