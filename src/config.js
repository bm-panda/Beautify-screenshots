const path = require("path");

const CONFIG_PATH = path.join(__dirname, "..", "beautify-config.json");

const DEFAULT_CONFIG = {
  bgType: "gradient",
  bgAngle: 135,
  bgColor1: "#667eea",
  bgColor2: "#764ba2",
  padding: 64,
  borderRadius: 12,
  shadowStrength: 30,
  scale: 100,
  format: "png",
  aspectRatio: "original",
  cmdName: "ScreenCapture",
  toolArgs: ["--cap:custom,clipboard"],
};

module.exports = { CONFIG_PATH, DEFAULT_CONFIG };
