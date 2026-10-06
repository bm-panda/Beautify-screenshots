const { createCanvas, loadImage } = require("@napi-rs/canvas");

function roundRect(ctx, x, y, width, height, radius) {
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

async function render(imageBuffer, config) {
  const img = await loadImage(imageBuffer);

  const scaleFactor = config.scale / 100;
  const imgWidth = img.width * scaleFactor;
  const imgHeight = img.height * scaleFactor;
  const padding = config.padding;
  const radius = config.borderRadius;
  const shadowBlur = config.shadowStrength;

  const contentW = imgWidth + padding * 2;
  const contentH = imgHeight + padding * 2;
  let ox = 0, oy = 0;

  if (config.aspectRatio && config.aspectRatio !== "original") {
    const r = { "16:9": 16/9, "4:3": 4/3, "1:1": 1 }[config.aspectRatio];
    if (contentW / contentH > r) {
      var canvasWidth = contentW;
      var canvasHeight = canvasWidth / r;
      oy = (canvasHeight - contentH) / 2;
    } else {
      var canvasHeight = contentH;
      var canvasWidth = canvasHeight * r;
      ox = (canvasWidth - contentW) / 2;
    }
  } else {
    var canvasWidth = contentW;
    var canvasHeight = contentH;
  }

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext("2d");

  if (config.gradient && config.gradient.startsWith("linear-gradient")) {
    const m = config.gradient.match(/linear-gradient\((\d+)deg,\s*([#\w]+)\s*\d*%?,\s*([#\w]+)\s*\d*%?\)/);
    if (m) {
      const angle = (parseInt(m[1]) * Math.PI) / 180;
      const color1 = m[2].trim();
      const color2 = m[3].trim();
      const x1 = canvasWidth / 2 - Math.cos(angle) * canvasWidth;
      const y1 = canvasHeight / 2 - Math.sin(angle) * canvasHeight;
      const x2 = canvasWidth / 2 + Math.cos(angle) * canvasWidth;
      const y2 = canvasHeight / 2 + Math.sin(angle) * canvasHeight;
      const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
      gradient.addColorStop(0, color1);
      gradient.addColorStop(1, color2);
      ctx.fillStyle = gradient;
    }
  } else if (config.bgType === "gradient" && config.bgColor1 && config.bgColor2) {
    const angle = (config.bgAngle * Math.PI) / 180;
    const x1 = canvasWidth / 2 - Math.cos(angle) * canvasWidth;
    const y1 = canvasHeight / 2 - Math.sin(angle) * canvasHeight;
    const x2 = canvasWidth / 2 + Math.cos(angle) * canvasWidth;
    const y2 = canvasHeight / 2 + Math.sin(angle) * canvasHeight;
    const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    gradient.addColorStop(0, config.bgColor1);
    gradient.addColorStop(1, config.bgColor2);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = config.bgColor1 || "#667eea";
  }
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (shadowBlur > 0) {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = shadowBlur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = shadowBlur / 3;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    roundRect(ctx, padding + ox, padding + oy, imgWidth, imgHeight, radius);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, padding + ox, padding + oy, imgWidth, imgHeight, radius);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, padding + ox, padding + oy, imgWidth, imgHeight);
  ctx.restore();

  const mimeType =
    config.format === "jpeg" ? "image/jpeg" :
    config.format === "webp" ? "image/webp" : "image/png";
  return canvas.toBuffer(mimeType);
}

module.exports = { render };
