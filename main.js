#!/usr/bin/env node

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const { readClipboardImage } = require("./src/clipboard");
const { DEFAULT_CONFIG } = require("./src/config");

const CONFIG_PATH = path.join(__dirname, "beautify-config.json");
const DEBUG_LOG = path.join(os.tmpdir(), "beautifier-debug.log");

function debugLog(info) {
  try {
    fs.appendFileSync(DEBUG_LOG, `[${new Date().toISOString()}] ${JSON.stringify(info)}\n`, "utf-8");
  } catch {}
}

function readPayload() {
  const payloadPath = process.argv[2];
  if (!payloadPath) return null;
  try {
    return JSON.parse(fs.readFileSync(payloadPath, "utf-8"));
  } catch (err) {
    console.error("参数文件解析失败:", err.message);
    return {};
  }
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return DEFAULT_CONFIG;
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function notify(env, message, type) {
  const apiBase = (env && env.api_base) || "http://127.0.0.1:9527";
  let url;
  try {
    url = new URL("/api/notify", apiBase);
  } catch {
    return;
  }
  const body = JSON.stringify({ message, notify_type: type || "success", duration: 3000 });
  try {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => res.resume()
    );
    req.on("error", () => {});
    req.write(body);
    req.end();
  } catch {}
}

async function readClipboardWithRetry(attempts = 8, delayMs = 250) {
  for (let i = 0; i < attempts; i++) {
    const buf = await readClipboardImage();
    if (buf) return buf;
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

function startCapture(env) {
  const config = loadConfig();
  const override = process.env.BEAUTIFY_CMD;
  const cmdName = override || config.cmdName;
  const toolArgs = override
    ? (process.env.BEAUTIFY_ARGS ? process.env.BEAUTIFY_ARGS.split(/\s+/).filter(Boolean) : [])
    : config.toolArgs || [];
  console.log("启动截图工具...");
  debugLog({ event: "capture_start", cmdName, toolArgs });

  const child = spawn(cmdName, toolArgs);

  child.on("error", (err) => {
    console.error("截图工具启动失败:", err.message);
    debugLog({ event: "capture_error", cmdName, message: err.message });
    notify(env, "截图工具启动失败: " + err.message, "error");
    process.exit(1);
  });

  child.on("close", async (code) => {
    debugLog({ event: "capture_close", code });
    if (code !== 9) {
      // 取消 / 关闭 / 其他操作：脚本结束
      process.exit(0);
    }
    const image = await readClipboardWithRetry();
    debugLog({ event: "clipboard_read", hasImage: !!image, size: image ? image.length : 0 });
    if (!image) {
      debugLog({ event: "no_image_after_capture" });
      notify(env, "未检测到截图内容", "error");
      process.exit(1);
    }
    try {
      require("./src/server").start({ environment: env }, image);
      debugLog({ event: "server_start_called" });
    } catch (err) {
      debugLog({ event: "server_start_throw", message: err && err.message });
      console.error(err);
      notify(env, "打开窗口失败: " + err.message, "error");
      process.exit(1);
    }
  });
}

function main() {
  const payload = readPayload();
  const env = (payload && payload.environment) || {};
  debugLog({
    event: "start",
    argv: process.argv.slice(2),
    invoke_mode: env.invoke_mode,
  });
  startCapture(env);
}

if (require.main === module) {
  main();
}
