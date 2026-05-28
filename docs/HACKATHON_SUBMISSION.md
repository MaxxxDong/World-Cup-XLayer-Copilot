# X Cup Hackathon 提交材料

## 项目名称

World-Cup-XLayer-Copilot

## 简介

World-Cup-XLayer-Copilot 是一个轻量 Chrome 插件 + X Layer Dapp。它让用户在浏览器里边看世界杯边问 AI：这场比赛是谁对谁、刚才发生了什么、那个球员是谁、解说在说什么、当前局势和市场怎么看。插件负责理解比赛，Dapp 负责链上钱包操作。

## 和 X Cup 的结合点

X Cup 鼓励围绕世界杯，在 X Layer 上构建能把球迷注意力转化为链上真实交易的产品。这个项目的结合点是：

- **世界杯主题**：所有数据、交互和市场围绕世界杯比赛展开。
- **AI Agent 产品**：AI 结合页面、画面、音频、球员、球队和市场上下文回答问题。
- **预测市场 / 交易入口**：Team A / Draw / Team B 市场直接对应比赛结果。
- **X Layer 部署**：已有 X Layer mainnet 合约、USDT0、市场 registry 和 Dapp。
- **可演示性**：插件、Dapp、合约、验证页面和 Demo 视频可以形成完整提交包。

## Live Demo

- Dapp: `http://kr.maxfugui.top/`
- Chain: X Layer mainnet, chain ID `196`
- Contract: `0xA486558db7f0d0e0C9F018e64Ecc737EFA12ade3`
- Verified source: `https://www.oklink.com/zh-hans/x-layer/evm/address/0xA486558db7f0d0e0C9F018e64Ecc737EFA12ade3/contract`
- Stake token: USDT0 / USD₮0 `0x779Ded0c9e1022225f8E0630b35a9b54bE713736`

## 核心亮点

- AI 陪你看球：不是只看盘口，而是先帮用户理解比赛。
- Chrome 插件入口轻：用户不需要迁移到新平台。
- 临时回看：画面和音频可以成为 AI 判断依据。
- 一键数据接入：球队、球员、球场、历史、赛程和来源数据已经结构化。
- X Layer 市场入口：从观赛现场跳到链上行动。
- 真链上证据：合约、交易、verified source 和 registry 都可查。

## Demo Flow

1. 打开一场世界杯页面或 Demo 页面。
2. 打开 Chrome 插件，识别当前比赛。
3. 问 AI 当前比赛和关键球员。
4. 开启临时回看，询问“刚才那个球员是谁”或“刚才解说说了什么”。
5. 查看插件里的 X Layer 市场预览。
6. 点击 Team A / Draw / Team B intent，进入 Dapp。
7. 在 Dapp 中连接钱包并查看链上池子和市场状态。
8. 展示 OKLink verified contract 页面。

## 安全说明

- 插件不保存钱包私钥。
- 插件不直接调用链上写交易。
- 用户自己的模型 Key 和 ASR Key 存在本地浏览器设置。
- 链上交易需要用户在钱包里确认。
