# Demo 包

这份文档用于快速演示 World-Cup-XLayer-Copilot。

## Demo 入口

- Dapp: `http://kr.maxfugui.top/`
- First-match deep link: `http://kr.maxfugui.top/?matchId=wc-2026-001-mex-rsa&outcome=teamA`
- Chrome extension source: `apps/extension`
- Contract: `0xA486558db7f0d0e0C9F018e64Ecc737EFA12ade3`
- Verified source: `https://www.oklink.com/zh-hans/x-layer/evm/address/0xA486558db7f0d0e0C9F018e64Ecc737EFA12ade3/contract`

## 建议演示顺序

1. 先展示浏览器里的轻量 Chrome 插件。
2. 让 AI 识别比赛并加载上下文。
3. 问“这个比赛现在怎么看？”展示 AI 分析。
4. 问“刚才那个球员是谁？”展示临时回看能力。
5. 问“刚才解说在说什么？”展示音频转写能力。
6. 展示当前比赛的 Team A / Draw / Team B 市场预览。
7. 点击进入 Dapp，展示钱包连接和链上市场。
8. 打开 OKLink verified contract 页面，证明链上部分真实存在。
9. 展示 GitHub 仓库、Apache 2.0 License 和 Demo 视频。

## 截图证据

| Evidence | File |
| --- | --- |
| Public dapp page | `docs/assets/demo/01-public-dapp.png` |
| OKLink verified contract page | `docs/assets/demo/02-oklink-verified-contract.png` |
| Smoke transaction | `docs/assets/demo/03-smoke-buy-tx.png` |
| Chrome extension smoke | `docs/assets/demo/04-chrome-extension-smoke.png` |

## 注意事项

- 如果只做只读演示，不需要触发钱包签名。
- 如果演示真实交易，必须明确告诉观众会使用真实 X Layer mainnet 和 USDT0。
- Chrome 插件是分析和入口层，Dapp 是钱包和交易层。
