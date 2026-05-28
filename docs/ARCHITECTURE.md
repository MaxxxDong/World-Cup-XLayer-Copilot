# 架构说明

World-Cup-XLayer-Copilot 由四层组成：Chrome 插件、赛事数据层、X Layer Dapp、智能合约。

## 组件

```text
Chrome Extension
  页面识别、AI 对话、临时回看、ASR、体育数据、X Layer 市场预览

Data Layer
  世界杯赛程、球队别名、历史战绩、球员/关键球员、球场、来源和实时 API 快照

X Layer Dapp
  钱包连接、USDT0 allowance、市场池子读取、交易确认、claim

Smart Contract
  Team A / Draw / Team B 三结果市场
  池子上限、单用户上限、close、resolve、void refund、claim
```

## 用户路径

1. 用户在浏览器里看比赛、回放、新闻或数据页面。
2. 插件识别当前比赛，并加载本地/远端赛事上下文。
3. 用户向 AI 提问。
4. 如果用户启用临时回看，插件会按设置附加最近画面或音频转写文本。
5. AI 结合页面、赛事数据、历史上下文和市场信号回答。
6. 插件展示当前比赛的 X Layer 市场预览。
7. 用户点击 Team A / Draw / Team B intent link。
8. Dapp 打开对应比赛和结果方向。
9. 用户用钱包完成链上确认。

## 数据路径

- 插件内置核心赛程和市场 registry。
- 当前比赛上下文按需加载，不要求用户手动预载所有历史数据。
- 体育 API Key 由用户自己填写，用于补充实时比分、状态和事件。
- X Layer 市场数据来自公开 registry 和合约只读调用。
- AI 请求使用用户配置的模型供应商和 API Key。

## 安全边界

- Chrome 插件不保存钱包私钥。
- Chrome 插件不发起 `approve`、`buy`、`claim`、`close`、`resolve`。
- Dapp 不保存私钥，交易由用户钱包签名。
- 合约不承诺固定赔率，结果由实际池子和结算状态决定。

## X Layer 配置

- Chain ID: `196`
- RPC: `https://rpc.xlayer.tech`
- Alternate RPC: `https://xlayerrpc.okx.com`
- Native gas token: `OKB`
- Stake token: USDT0 / USD₮0 `0x779Ded0c9e1022225f8E0630b35a9b54bE713736`
