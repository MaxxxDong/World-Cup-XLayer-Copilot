import { readFile } from "node:fs/promises";

const manifest = JSON.parse(await readFile("apps/extension/public/manifest.json", "utf8"));
const extensionMarkets = JSON.parse(await readFile("apps/extension/public/xlayer-markets.json", "utf8"));
const extensionChampion = JSON.parse(await readFile("apps/extension/public/xlayer-champion.json", "utf8"));
const webMarkets = JSON.parse(await readFile("apps/web/public/markets.json", "utf8"));
const packageJson = JSON.parse(await readFile("apps/extension/package.json", "utf8"));
const popupApp = await readFile("apps/extension/src/popup/PopupApp.tsx", "utf8");
const sidePanelApp = await readFile("apps/extension/src/side-panel/SidePanelApp.tsx", "utf8");
const marketService = await readFile("apps/extension/src/services/xlayer-market.ts", "utf8");
const background = await readFile("apps/extension/src/background.ts", "utf8");
const providerPresets = await readFile("apps/extension/src/shared/provider-presets.ts", "utf8");

if (manifest.manifest_version !== 3) {
  throw new Error("Extension manifest must use MV3.");
}

if (manifest.name !== "World-Cup-XLayer-Copilot") {
  throw new Error("Extension manifest name must distinguish the X Layer fork from the original plugin.");
}

if (manifest.action?.default_title !== "World-Cup-XLayer-Copilot") {
  throw new Error("Extension toolbar title must distinguish the X Layer fork from the original plugin.");
}

if (manifest.action?.default_popup !== "popup.html") {
  throw new Error("Extension action must point to popup.html.");
}

if (manifest.side_panel?.default_path !== "side-panel.html") {
  throw new Error("Extension side panel must point to side-panel.html.");
}

if (!Array.isArray(extensionMarkets) || extensionMarkets.length < 10) {
  throw new Error("Extension X Layer registry must include the first 10 seeded markets.");
}

if (extensionMarkets.length < 72) {
  throw new Error("Extension X Layer registry must include all 72 group-stage fixtures.");
}

if (!Array.isArray(extensionChampion.entries) || extensionChampion.entries.length < 32) {
  throw new Error("Extension champion reference registry must include full-tournament team odds.");
}

const webMarketIds = new Set(webMarkets.map((market) => market.matchId));
const missing = extensionMarkets.filter((market) => !webMarketIds.has(market.matchId));
if (missing.length) {
  throw new Error(`Extension registry contains match IDs not found in the Dapp registry: ${missing.map((market) => market.matchId).join(", ")}`);
}

if (extensionMarkets.some((market) => "polymarketQuery" in market)) {
  throw new Error("Extension registry must not carry Polymarket query fields.");
}

const hostPermissions = manifest.host_permissions ?? [];
if (!hostPermissions.includes("http://kr.maxfugui.top/*")) {
  throw new Error("Extension manifest must allow the X Layer Dapp host.");
}

if (hostPermissions.some((permission) => String(permission).includes("xiaomimimo")) || providerPresets.includes("xiaomi")) {
  throw new Error("Xiaomi ASR must not be present in the X Layer extension provider presets.");
}

if (hostPermissions.some((permission) => String(permission).includes("polymarket"))) {
  throw new Error("Extension manifest must not request Polymarket host permissions.");
}

if (packageJson.name !== "world-cup-xlayer-copilot-extension") {
  throw new Error("Extension package name changed unexpectedly.");
}

for (const [label, source] of Object.entries({ popupApp, sidePanelApp })) {
  if (!source.includes("searchXLayerMarketsForMatch")) {
    throw new Error(`${label} must load X Layer market candidates.`);
  }
  if (!source.includes("openXLayerDappPopup")) {
    throw new Error(`${label} must open X Layer Dapp intents.`);
  }
  if (source.includes("Polymarket") || source.includes("polymarket")) {
    throw new Error(`${label} must not contain Polymarket UI text or imports.`);
  }
}

if (!marketService.includes("getPools") && !marketService.includes("GET_POOLS_SELECTOR")) {
  throw new Error("X Layer market service must read pool data.");
}

if (!marketService.includes("GET_ODDS_BPS_SELECTOR")) {
  throw new Error("X Layer market service must read odds data.");
}

if (!background.includes("OPEN_XLAYER_DAPP_POPUP") || !background.includes("OPEN_XLAYER_DAPP_TAB")) {
  throw new Error("Background worker must handle X Layer Dapp open routes.");
}

console.log(`Extension check passed: full plugin fork, ${extensionMarkets.length} X Layer markets, ${extensionChampion.entries.length} champion references, MV${manifest.manifest_version}.`);
