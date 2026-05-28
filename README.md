# World-Cup-XLayer-Copilot

World-Cup-XLayer-Copilot 是一个轻量 Chrome 插件 + X Layer Dapp 项目。它面向世界杯观赛场景：用户一边看比赛、回放、集锦或赛事页面，一边让 AI 帮忙理解局面、球员、解说和市场信号；当用户想行动时，再跳转到 X Layer Dapp，通过自己的钱包完成链上操作。

这个项目不是单纯的预测市场页面，也不是单纯的 AI 聊天框。它把三件事连在一起：

- AI 观赛助手：识别比赛、解释局势、回答球员和赛事问题。
- 赛事数据层：整理球队、球员、赛程、球场、历史和实时 API 上下文。
- X Layer 市场入口：用真实 X Layer 合约和 USDT0 展示 Team A / Draw / Team B 市场。

## 用户能做什么

- 在 Chrome 里打开一个轻量插件，不用离开正在看的比赛页面。
- 问 AI：“现在是哪场比赛？”“刚才那个球员是谁？”“刚才解说在说什么？”“这场局势怎么看？”
- 开启临时回看后，让 AI 结合最近画面、音频转写、页面文本和赛事数据回答。
- 查看当前比赛相关的 X Layer 市场预览。
- 点击进入 Dapp，用自己的钱包连接、授权、交易或查看链上结果。

## 为什么适合 X Cup Hackathon

OKX X Cup 要求项目围绕世界杯，在 X Layer 上建设，并鼓励预测市场、交易、社交、NFT、GameFi、AI Agent 等方向。World-Cup-XLayer-Copilot 的切入点是：

- 用 AI Agent 承接世界杯观赛注意力。
- 用 Chrome 插件把入口放到真实观赛现场。
- 用 X Layer Dapp 承接链上操作。
- 用可验证合约、真实 USDT0 和公开交易记录证明链上部分不是 mock。
- 用 Demo 视频和社媒物料说明产品如何把“看比赛”转化为“理解比赛，再进入链上市场”。

## 当前 Demo

- Dapp: `http://kr.maxfugui.top/`
- X Layer contract: `0xA486558db7f0d0e0C9F018e64Ecc737EFA12ade3`
- Verified source: `https://www.oklink.com/zh-hans/x-layer/evm/address/0xA486558db7f0d0e0C9F018e64Ecc737EFA12ade3/contract`
- 已部署比赛市场：前 10 场小组赛
- 数据 registry：72 场世界杯小组赛、48 支冠军候选队伍参考数据

## 仓库结构

```text
apps/extension/      Chrome MV3 插件
apps/web/            X Layer Dapp
contracts/           Solidity 合约
scripts/             数据导出、合约交互和维护脚本
data/                比赛、市场和参考数据
deployments/         公开部署地址和交易 metadata
verification/        合约验证辅助文件
docs/                产品、架构、规则、Demo 和黑客松提交材料
marketing/           Demo 视频、口播稿、海报和社媒文案
```

## 快速运行

安装依赖：

```bash
npm install
npm install --prefix apps/extension
```

检查合约和主工程：

```bash
npm run compile
npm test
npx tsc --noEmit
```

运行 Dapp：

```bash
npm run dev:web
```

构建 Dapp：

```bash
npm run build:web
```

构建 Chrome 插件：

```bash
npm run build:extension
npm run check:extension
```

本地加载插件：

1. 打开 `chrome://extensions`。
2. 开启 Developer Mode。
3. 点击 `Load unpacked`。
4. 选择 `apps/extension/dist`。

## 使用自己的模型和数据 Key

插件支持用户自己配置：

- OpenAI-compatible 文本模型
- 视觉模型
- ASR / 音频转写服务
- 体育数据 API

这些 Key 保存在用户本地浏览器设置里。项目不会在仓库里提供、托管或提交任何用户 Key。

## 安全边界

- 插件只做识别、分析、展示和跳转，不直接发起链上写交易。
- 钱包连接、授权、购买、claim 都在 Dapp 中由用户钱包确认。
- 仓库不包含私钥、助记词、用户 API Key、本地缓存或浏览器 Profile。
- `.env.example` 只保留公开默认值和空占位。

## 文档

- [产品卖点](docs/PITCH.md)
- [黑客松提交材料](docs/HACKATHON_SUBMISSION.md)
- [Demo 包](docs/DEMO_PACKAGE.md)
- [产品规格](docs/PRODUCT_SPEC.md)
- [架构说明](docs/ARCHITECTURE.md)
- [市场规则](docs/MARKET_RULES.md)
- [模型供应商预设](docs/PROVIDER_PRESETS.md)
- [OKX / X Layer 知识库](docs/OKX_KNOWLEDGE_BASE.md)

## License

Apache License 2.0. See [LICENSE](LICENSE).
