# 产品规格

## 定位

World-Cup-XLayer-Copilot 是一个世界杯 AI 观赛助手。它以 Chrome 插件作为入口，以结构化赛事数据和临时回看作为 AI 判断依据，以 X Layer Dapp 作为链上市场操作入口。

## 核心用户

- 普通球迷：想快速看懂比赛、球员和刚才发生的细节。
- Web3 用户：想在观赛过程中找到对应的 X Layer 市场入口。
- 黑客松评委：需要看到 AI Agent、世界杯场景、X Layer 部署和可演示完整度。
- 开发者：希望复用 Chrome 插件、赛事数据层、X Layer Dapp 和合约结构。

## 核心能力

### Chrome 插件

- 识别当前页面对应的世界杯比赛。
- 展示当前比赛、候选比赛和手动选择入口。
- 加载球队、球员、历史、球场、赛程和来源上下文。
- 支持文本模型、视觉模型、ASR 和体育数据 API 的用户自带 Key。
- 支持临时回看：按用户设置上传最近画面或音频转写结果。
- 展示 X Layer Team A / Draw / Team B 市场预览。
- 打开 Dapp intent link，不直接签名或交易。

### 数据层

- 内置世界杯赛程和球队别名。
- 支持历史数据包、球员数据包和比赛上下文按需加载。
- 支持实时体育 API 补充比分、赛程快照和事件。
- 支持 X Layer 市场 registry 和冠军参考数据。

### X Layer Dapp

- 读取市场 registry。
- 展示 Team A / Draw / Team B 三结果市场。
- 连接用户钱包。
- 读取 USDT0 余额、allowance、池子和用户持仓。
- 让用户在 Dapp 中执行 approve、buy、claim。

### 合约

- 三结果市场：Team A、Draw、Team B。
- 使用 X Layer mainnet 上的 USDT0。
- 支持总池上限、单用户上限、关闭、结算、void refund 和 claim。
- 拒绝把非 void 结果结算到空 winning pool，避免资金无法领取。

## 非目标

- 不在插件里托管用户私钥。
- 不在插件里直接发起链上写交易。
- 不提供项目方统一 AI Key。
- 不把 Polymarket 作为交易执行层。
- 不把当前版本包装成无风险金融产品。

## 当前 Demo 边界

- 前 10 场小组赛已部署正式市场。
- 72 场小组赛已进入 registry，未部署市场以 reference 状态展示。
- 冠军市场当前是参考数据展示，不启用钱包交易。
- 结算目前是维护者手动结算，正式扩大使用前应迁移到更稳健的治理或 oracle 流程。
