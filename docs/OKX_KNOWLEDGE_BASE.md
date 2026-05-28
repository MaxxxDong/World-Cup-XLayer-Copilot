# OKX / X Layer 知识库

这份文档记录本项目依赖的 OKX / X Layer 一手资料入口，方便评委和开发者核对。

## 官方资料

- X Layer: https://web3.okx.com/zh-hans/xlayer
- OnchainOS: https://web3.okx.com/zh-hans/onchainos
- X Layer network information: https://web3.okx.com/xlayer/docs/developer/build-on-xlayer/network-information
- X Layer RPC endpoints: https://web3.okx.com/xlayer/docs/developer/rpc-endpoints/rpc-endpoints
- X Cup Hackathon: https://web3.okx.com/zh-hans/xlayer/build-x-hackathon/xcup

## 和本项目的关系

X Cup 关注世界杯流量、X Layer 链上建设、创新性、潜在市场价值、完成度和 Demo 展示。World-Cup-XLayer-Copilot 对应的是：

- 世界杯：所有比赛、球员和市场都围绕世界杯。
- AI Agent：插件把页面、画面、音频、历史数据和实时数据交给 AI 分析。
- 交易 / 预测市场：Dapp 提供 Team A / Draw / Team B 的 X Layer 市场入口。
- X Layer 部署：合约和 Dapp 使用 X Layer mainnet。
- 可演示性：插件、Dapp、合约验证、社媒物料和 Demo 视频可以组成完整提交包。

## 集成边界

插件可以：

- 读取公开市场 registry。
- 读取 X Layer 合约状态。
- 展示 Team A / Draw / Team B 市场预览。
- 打开 Dapp deep link。

插件不做：

- 钱包连接。
- USDT0 approve。
- 合约 buy / claim / close / resolve。
- 保存用户私钥或助记词。

Dapp 负责：

- 钱包连接。
- 用户确认交易。
- 合约状态展示。
- 交易结果和 claim 流程。
