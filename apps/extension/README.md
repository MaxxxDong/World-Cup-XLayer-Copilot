# World-Cup-XLayer-Copilot Extension

这是本仓库内独立维护的 Chrome MV3 插件。它保留 AI 赛事助手的完整产品形态，但源码、构建、发布和文档都落在本项目内，不依赖其他本地工作区或旧插件构建产物。

## 当前定位

- 保留完整赛事助手能力：页面比赛识别、AI 对话分析、设置页、侧边栏、popup、体育数据 Key、数据包下载、临时回看、图片证据、音频 ASR 转写。
- 移除原插件的 Polymarket 展示、iframe、搜索和交易入口。
- 新增 X Layer 市场服务：读取 `xlayer-markets.json`，通过 X Layer RPC 只读调用 `getPools` / `getOddsBps`，展示 Team A / Draw / Team B 三个结果选项。
- 当链上池子还没有 USDT0 流动性时，插件展示明确标记的 reference odds；一旦池子有真实资金，就优先显示链上池子倍率。
- 比赛识别是本地赛程/页面文本逻辑，不依赖用户先配置大模型。大模型只影响 AI 对话分析。
- 临时回看默认可用；图片上传必须先配置 vision model，音频上传必须先配置 ASR endpoint、API key 和 model。
- 真实钱包连接、USDT0 approve、buy、claim 都在独立 Dapp `http://kr.maxfugui.top/` 完成；插件只打开带 `matchId` 和 `outcome` 的意图链接。
- 文本/视觉大模型与 ASR 转写供应商预设见根目录 [Provider Presets](../../docs/PROVIDER_PRESETS.md)；预设只填入可编辑 Endpoint/模型名，Key 仍由用户自己提供。

## 关键文件

- `public/manifest.json`：MV3 manifest，包含侧边栏、popup、offscreen 回看和 X Layer/Dapp host permissions。
- `public/xlayer-markets.json`：插件打包内置的 72 场小组赛 X Layer 市场 registry，不包含 Polymarket 字段。
- `public/xlayer-champion.json`：插件打包内置的世界杯冠军 reference odds，用于全程冠军相关分析，不直接触发钱包交易。
- `src/services/xlayer-market.ts`：X Layer registry/RPC 只读市场服务。
- `src/side-panel/SidePanelApp.tsx`：完整侧边栏体验和 X Layer 盘口预览。
- `src/popup/PopupApp.tsx`：轻量 popup 和 X Layer Dapp 快速入口。

## 本地开发

```powershell
npm install
npm run lint
npm test
npm run build
```

也可以从仓库根目录运行：

```powershell
npm run lint:extension
npm run test:extension
npm run build:extension
npm run check:extension
```

## Chrome 加载

1. 运行 `npm run build`。
2. 打开 `chrome://extensions`。
3. 开启 Developer Mode。
4. 点击 `Load unpacked`。
5. 选择本仓库下的 `apps/extension/dist`。

## 隐私和边界

- 用户的大模型 Key、体育数据 Key、ASR Key 只存储在本地 extension storage。
- 插件不保存钱包私钥、助记词、交易签名或 X Layer 登录态。
- 插件不会直接执行 USDT0 approve、buy、claim、resolve。
- X Layer 合约赔率是分析信号和交易入口提示，不是投注建议。
