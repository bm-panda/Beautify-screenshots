const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { createCanvas, loadImage } = require("@napi-rs/canvas");

const READ_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$img = $null
for ($i = 0; $i -lt 10; $i++) {
  try { $img = [System.Windows.Forms.Clipboard]::GetImage() } catch { $img = $null }
  if ($img -ne $null) { break }
  Start-Sleep -Milliseconds 150
}
if ($img -ne $null) {
  $temp = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), [System.IO.Path]::GetRandomFileName() + ".png")
  $img.Save($temp, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output $temp
} else {
  Write-Output ""
}
`;

function execPsScript(script) {
  const tempFile = path.join(os.tmpdir(), `cb-${Date.now()}-${Math.random().toString(36).slice(2)}.ps1`);
  fs.writeFileSync(tempFile, script, "utf-8");
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", tempFile],
      { stdio: ["ignore", "pipe", "pipe"], timeout: 20000 }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      try {
        fs.unlinkSync(tempFile);
      } catch {}
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr.trim() || `exit code ${code}`));
    });
    child.on("error", reject);
  });
}

async function readClipboardImage() {
  try {
    const result = await execPsScript(READ_SCRIPT);
    if (!result) return null;
    if (!fs.existsSync(result)) return null;
    const buffer = fs.readFileSync(result);
    try {
      fs.unlinkSync(result);
    } catch {}
    return buffer;
  } catch {
    return null;
  }
}

async function writeClipboardImage(buffer) {
  const img = await loadImage(buffer);
  const canvas = createCanvas(img.width, img.height);
  canvas.getContext("2d").drawImage(img, 0, 0);
  const png = canvas.toBuffer("image/png");

  const tempImg = path.join(os.tmpdir(), `cb-write-${Date.now()}-${Math.random().toString(36).slice(2)}.png`);
  fs.writeFileSync(tempImg, png);
  const escaped = tempImg.replace(/\\/g, "\\\\");
  const writeScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("${escaped}")
for ($i = 0; $i -lt 10; $i++) {
  try { [System.Windows.Forms.Clipboard]::SetImage($img); break } catch { Start-Sleep -Milliseconds 150 }
}
$img.Dispose()
`;
  try {
    await execPsScript(writeScript);
  } finally {
    try {
      fs.unlinkSync(tempImg);
    } catch {}
  }
}

module.exports = { readClipboardImage, writeClipboardImage };
