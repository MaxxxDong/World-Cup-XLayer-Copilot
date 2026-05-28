import fs from "node:fs";
import path from "node:path";

const outDir = path.resolve("marketing/posters/svg");

const posters = [
  {
    id: "zh-01-ai-copilot",
    lang: "zh",
    kicker: "WORLD CUP · AI COPILOT",
    title: ["AI 陪你", "看世界杯"],
    subtitle: ["轻量 Chrome 插件，边看边问，", "错过的瞬间也能回看。"],
    points: ["识别当前比赛", "看最近画面", "听懂解说", "直达 X Layer"],
    footer: "World-Cup-XLayer-Copilot · Built for X Cup"
  },
  {
    id: "zh-02-replay-data",
    lang: "zh",
    kicker: "REPLAY · DATA · MARKET",
    title: ["刚才是谁？", "问一句就行"],
    subtitle: ["画面、音频、球队、球员、历史数据，", "一起成为 AI 的判断依据。"],
    points: ["临时回看", "ASR 转写", "球员背景", "赛事上下文"],
    footer: "Chrome 插件 + AI Agent + X Layer Dapp"
  },
  {
    id: "zh-03-xlayer-action",
    lang: "zh",
    kicker: "X LAYER MARKET ENTRY",
    title: ["看懂比赛", "再进入链上"],
    subtitle: ["插件负责理解比赛；Dapp 负责钱包连接，", "并承接 X Layer 市场行动。"],
    points: ["Team A", "Draw", "Team B", "USDT0"],
    footer: "Verified contract · Public registry · Real demo"
  },
  {
    id: "en-01-ai-copilot",
    lang: "en",
    kicker: "WORLD CUP · AI COPILOT",
    title: ["AI watches", "with you"],
    subtitle: ["A lightweight Chrome extension for match context,", "replay understanding, and X Layer signals."],
    points: ["Detect match", "Read replay", "Hear commentary", "Open X Layer"],
    footer: "World-Cup-XLayer-Copilot · Built for X Cup"
  },
  {
    id: "en-02-replay-data",
    lang: "en",
    kicker: "REPLAY · DATA · MARKET",
    title: ["Who was that?", "Ask instantly"],
    subtitle: ["Frames, audio, teams, players, history,", "and live data become AI evidence."],
    points: ["Replay frames", "ASR transcript", "Player context", "Match data"],
    footer: "Chrome Extension + AI Agent + X Layer Dapp"
  },
  {
    id: "en-03-xlayer-action",
    lang: "en",
    kicker: "X LAYER MARKET ENTRY",
    title: ["Understand first", "act on-chain"],
    subtitle: ["The extension explains the game.", "The Dapp carries X Layer market actions."],
    points: ["Team A", "Draw", "Team B", "USDT0"],
    footer: "Verified contract · Public registry · Real demo"
  }
];

function esc(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function textLines(lines, x, y, size, lineHeight, color = "#201b16", weight = "800", family = "Georgia, 'Times New Roman', serif") {
  return lines
    .map((line, index) => `<text x="${x}" y="${y + index * lineHeight}" fill="${color}" font-size="${size}" font-weight="${weight}" font-family="${family}" letter-spacing="0">${esc(line)}</text>`)
    .join("\n");
}

function pointList(points) {
  return points
    .map((point, index) => {
      const y = 1245 + index * 105;
      return `
        <rect x="104" y="${y - 54}" width="872" height="78" fill="#fffaf1" stroke="#d8c7aa" />
        <circle cx="146" cy="${y - 15}" r="9" fill="#d69a2d" />
        <text x="176" y="${y}" fill="#29231d" font-size="34" font-weight="800" font-family="Inter, Arial, sans-serif">${esc(point)}</text>
      `;
    })
    .join("\n");
}

function renderPoster(poster) {
  return `<svg width="1080" height="1920" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <pattern id="grid" width="72" height="72" patternUnits="userSpaceOnUse">
      <path d="M72 0H0V72" fill="none" stroke="#dfd2bd" stroke-width="1" opacity="0.42" />
    </pattern>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f9f2e7" />
      <stop offset="1" stop-color="#fffaf1" />
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="26" flood-color="#4b3621" flood-opacity="0.18"/>
    </filter>
  </defs>
  <rect width="1080" height="1920" fill="url(#paper)" />
  <rect width="1080" height="1920" fill="url(#grid)" />
  <path d="M0 0H1080V320C808 274 682 136 486 108C306 82 162 122 0 198Z" fill="#eadbc2" opacity="0.52" />
  <path d="M1080 1920H0V1640C210 1698 358 1794 580 1762C812 1728 930 1582 1080 1530Z" fill="#241d16" opacity="0.94" />
  <rect x="64" y="1658" width="952" height="208" fill="#241d16" opacity="0.96" />
  <rect x="64" y="74" width="952" height="1768" fill="none" stroke="#cdbb9c" stroke-width="2" opacity="0.7" />
  <g filter="url(#shadow)">
    <rect x="104" y="164" width="872" height="1506" fill="#fffdf8" opacity="0.72" stroke="#dcccb4" />
  </g>
  <line x1="124" y1="258" x2="196" y2="258" stroke="#d69a2d" stroke-width="4" />
  <text x="222" y="272" fill="#9a6417" font-size="30" font-weight="900" font-family="Inter, Arial, sans-serif" letter-spacing="5">${esc(poster.kicker)}</text>
  ${textLines(poster.title, 112, 500, poster.lang === "zh" ? 124 : 98, poster.lang === "zh" ? 138 : 112)}
  ${poster.subtitle.map((line, index) => `<text x="108" y="${850 + index * 58}" fill="#6f6356" font-size="${poster.lang === "zh" ? 38 : 34}" font-weight="700" font-family="Inter, Arial, sans-serif">${esc(line)}</text>`).join("\n")}
  <g>
    <circle cx="830" cy="1000" r="110" fill="none" stroke="#d69a2d" stroke-width="18" />
    <path d="M780 1000H880M830 950V1050" stroke="#201b16" stroke-width="16" stroke-linecap="round" />
    <path d="M738 1094C790 1140 871 1141 924 1094" fill="none" stroke="#2d6b55" stroke-width="10" stroke-linecap="round" />
  </g>
  ${pointList(poster.points)}
  <text x="104" y="1740" fill="#f8edda" font-size="34" font-weight="900" font-family="Inter, Arial, sans-serif">${esc(poster.footer)}</text>
  <text x="104" y="1795" fill="#d7c7af" font-size="26" font-family="Inter, Arial, sans-serif">Chrome Extension · AI Agent · Football Data · X Layer</text>
</svg>`;
}

fs.mkdirSync(outDir, { recursive: true });
for (const poster of posters) {
  fs.writeFileSync(path.join(outDir, `${poster.id}.svg`), renderPoster(poster), "utf8");
}

console.log(`Generated ${posters.length} poster SVG files in ${outDir}`);
