import fs from "fs";
import path from "path";

const langsDir = "/home/rebiz/opt/lumi/packages/core/src/languages";
const enPath = path.join(langsDir, "en-US", "commands.json");
const enData = JSON.parse(fs.readFileSync(enPath, "utf-8"));

const locales = ["de", "es-ES", "fr"];

for (const loc of locales) {
  const locPath = path.join(langsDir, loc, "commands.json");
  if (fs.existsSync(locPath)) {
    const locData = JSON.parse(fs.readFileSync(locPath, "utf-8"));
    // Merge missing keys
    for (const key of Object.keys(enData)) {
      if (!(key in locData)) {
        locData[key] = enData[key];
      }
    }
    // Remove extra keys
    for (const key of Object.keys(locData)) {
      if (!(key in enData)) {
        delete locData[key];
      }
    }
    fs.writeFileSync(locPath, JSON.stringify(locData, null, 2) + "\n");
    console.log(`Synced ${loc}/commands.json`);
  }
}
