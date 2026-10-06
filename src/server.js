const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, execSync } = require("child_process");
const { writeClipboardImage } = require("./clipboard");
const { render } = require("./renderer");
const { CONFIG_PATH, DEFAULT_CONFIG } = require("./config");

const WINDOW_W = 900;
const WINDOW_H = 620;
const ROOT = path.join(__dirname, "..");
const DEBUG_LOG = path.join(os.tmpdir(), "beautifier-debug.log");

let capturedImage = null;

function debugLog(info) {
  try {
    fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${JSON.stringify(info)}\n`, "utf-8");
  } catch {}
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function readConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function writeConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  } catch {}
}

function findBrowser() {
  const candidates = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getCenterArgs() {
  try {
    const out = execSync(
      'powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds; Write-Output ($b.Width); Write-Output ($b.Height)"',
      { encoding: "utf-8", timeout: 5000 }
    );
    const lines = out.trim().split(/\r?\n/).map((s) => parseInt(s.trim(), 10));
    const sw = lines[0];
    const sh = lines[1];
    if (!sw || !sh) return [];
    const left = Math.max(0, Math.round((sw - WINDOW_W) / 2));
    const top = Math.max(0, Math.round((sh - WINDOW_H) / 2));
    return [`--window-position=${left},${top}`, `--window-size=${WINDOW_W},${WINDOW_H}`];
  } catch {
    return [];
  }
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function handleRequest(req, res, image) {
  const img = image || capturedImage;
  const url = new URL(req.url, "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/api/source" && req.method === "GET") {
    if (!img) {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "image/png" });
    res.end(img);
    return;
  }

  if (pathname === "/api/config" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(readConfig()));
    return;
  }

  if (pathname === "/api/config" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        writeConfig({ ...DEFAULT_CONFIG, ...JSON.parse(body) });
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (pathname === "/api/beautify" && req.method === "POST") {
    if (!img) {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "没有可美化的截图" }));
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const config = { ...DEFAULT_CONFIG, ...JSON.parse(body || "{}") };
        const result = await render(img, config);
        await writeClipboardImage(result);
        writeConfig(config);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    res.end("Method Not Allowed");
    return;
  }

  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(ROOT, rel);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  serveFile(res, filePath);
}

function openBrowser(url, onClose) {
  const browser = findBrowser();
  if (!browser) {
    spawn("cmd.exe", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return null;
  }
  const userDataDir = path.join(os.homedir(), ".beautifier-browser-profile");
  const args = [
    "--app=" + url,
    "--no-first-run",
    "--no-default-browser-check",
    "--user-data-dir=" + userDataDir,
    ...getCenterArgs(),
  ];
  const proc = spawn(browser, args);
  proc.on("exit", onClose);
  return proc;
}

function openWindow(url, onClose) {
  const startedAt = Date.now();
  let webview;
  debugLog({ event: "webview_spawn", url });
  try {
    webview = spawn(
      "webview-cli",
      [
        url,
        "--title",
        "截图美化",
        "--width",
        String(WINDOW_W),
        "--height",
        String(WINDOW_H),
      ],
      { stdio: "ignore", windowsHide: false }
    );
  } catch (err) {
    debugLog({ event: "webview_spawn_throw", message: err.message });
    openBrowser(url, onClose);
    return;
  }
  let settled = false;
  webview.on("error", (err) => {
    if (settled) return;
    settled = true;
    debugLog({ event: "webview_error", code: err.code, message: err.message });
    openBrowser(url, onClose);
  });
  webview.on("exit", (code) => {
    debugLog({ event: "webview_exit", code, elapsed: Date.now() - startedAt });
    if (settled) return;
    settled = true;
    // 非 0（正常 resolve）且非 2（用户关窗）且很快退出 → 视为启动失败，回退浏览器
    const early = Date.now() - startedAt < 3000;
    if (code !== 0 && code !== 2 && early) {
      openBrowser(url, onClose);
      return;
    }
    onClose();
  });
}

function start(context, image) {
  capturedImage = image || null;
  debugLog({ event: "server_start", hasImage: !!capturedImage });

  const server = http.createServer((req, res) => handleRequest(req, res));

  const shutdown = () => {
    try {
      server.close();
    } catch {}
    process.exit(0);
  };

  server.on("error", (err) => {
    debugLog({ event: "server_error", message: err.message });
    console.error("服务启动失败:", err.message);
    process.exit(1);
  });

  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    const url = "http://127.0.0.1:" + port + "/";
    console.log("服务已启动: " + url);
    debugLog({ event: "server_listen", port, hasImage: !!capturedImage });
    openWindow(url, shutdown);
  });

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

module.exports = { start, handleRequest };
