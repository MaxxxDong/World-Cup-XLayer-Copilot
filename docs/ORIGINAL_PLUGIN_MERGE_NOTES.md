# 原插件通用功能回并说明

这份文档用于后续把当前插件分支里的通用能力回并到最早的世界杯助手 Chrome 插件。范围只包含插件本身的体验、设置、数据、AI、临时回看和 ASR 能力；当前独立项目的定制市场、外部交易入口、合约和活动提交材料不在本文范围内。

## 基线和目标

- 来源：当前独立项目里的 `apps/extension`。
- 目标：最早的世界杯助手插件代码库。
- 回并原则：
  - 保留原插件现有的市场/分析业务边界，不替换成当前独立项目的定制市场逻辑。
  - 优先回并可独立工作的通用模块，不搬运定制市场服务。
  - 设置、文案和数据包能力要保持中文/英文可用。
  - 回并后必须跑单元测试、构建，并在 Chrome 里做一次真实插件 smoke test。

## 建议回并的功能

### 1. AI / 模型供应商预设

当前版本把模型配置从单一 OpenAI-compatible 表单升级为“供应商预设 + 自定义”的模式。

可回并内容：

- 新增 `src/shared/provider-presets.ts`。
- 在 `src/shared/types.ts` 中增加：
  - `LLMProviderPreset`
  - `TranscriptionProviderPreset`
  - `LLMProviderProfile`
  - `TranscriptionProviderProfile`
  - `providerProfiles`
- 在 `src/services/settings.ts` 中保存每个供应商独立配置。
- 在 `src/options/OptionsApp.tsx` 中加入：
  - 文本/视觉模型供应商选择。
  - 切换供应商后自动保存。
  - 切换提示：“已切换为某供应商，之前填写过的配置会保存在本地。”
  - API Key 默认不预填，用户必须自己填写。

推荐保留的供应商预设：

- OpenAI
- OpenRouter
- Google Gemini
- xAI Grok
- DeepSeek
- Aliyun DashScope
- Tencent Hunyuan
- Volcengine Ark
- Zhipu BigModel
- Moonshot Kimi
- Custom OpenAI-compatible

注意：

- 原插件如果仍使用 Polymarket，不需要改 `PredictionMarketSignal` 的 provider 字段。
- 只移植模型供应商和设置持久化，不移植任何定制市场字段。

### 2. 模型测试和错误提示增强

当前版本改进了模型测试和 OpenAI-compatible 兼容性。

可回并内容：

- `src/services/llm.ts`
  - 文本模型和视觉模型分别测试。
  - 支持更多响应结构：
    - `choices[].message.content`
    - content parts 数组
    - `choices[].message.reasoning_content`
    - `choices[].text`
    - `output_text`
    - `output[].content[].text`
  - 非 JSON 响应给出更明确错误，提示检查 Base URL 是否指向 API root，以及 `/chat/completions` 是否有效。
  - 将类似 `https://example.com/1` 的误填路径归一化为 `/v1`。

配套测试：

- `src/test/llm.test.ts`
  - 覆盖 `/1` 到 `/v1` 的兼容修正。
  - 覆盖 content parts / reasoning content 的提取。
  - 覆盖 HTML 非 JSON 返回的错误提示。

### 3. ASR / 音频转写供应商升级

当前版本把语音转写从单一或少量供应商升级为多供应商预设，并修正了“服务可达但没有识别文字”的判断。

可回并内容：

- `src/shared/provider-presets.ts`
  - ASR 供应商预设。
  - `directUpload` 标记，区分浏览器可直传和需要服务端 adapter 的供应商。
- `src/services/transcription.ts`
  - OpenAI Audio Transcriptions multipart 上传。
  - Groq Whisper OpenAI-compatible 上传。
  - Deepgram Nova 直传支持和结果解析。
  - Aliyun DashScope Qwen ASR 兼容调用。
  - Tencent / Volcengine 这类需要签名或 WebSocket 的供应商，在插件里提示需要服务端 adapter。
  - 测试转写时，如果 endpoint 可达但小探针没有语音文本，不再直接判定“不可达”，而是提示“接口可达，但探针无有效语音”。

设置侧变更：

- 移除设置页里的“启用音频转写服务”总开关。
- 音频是否上传，统一由完整面板里的临时回看“上传音频”开关控制。
- 供应商切换时保存每个供应商的 endpoint、key、model、window seconds。

注意：

- 不建议把任何供应商 Key、默认可用 Key 或内部代理地址写入代码。
- 需要服务端签名的供应商不要假装浏览器直连可用，应显示 adapter 提示。

### 4. 临时回看控制逻辑

当前版本把临时回看从“设置页全局启用”改为“完整面板直接控制证据上传”。

可回并内容：

- `src/domain/replay-upload.ts`
  - `hasReplayVisionModel`
  - `getReplayAudioMissingRequirements`
  - `hasReplayAudioModel`
  - 只有配置视觉模型时才允许上传图片。
  - 只有配置 ASR endpoint、API key、model 时才允许上传音频。
- `src/shared/chrome-helpers.ts`
  - 启动本地缓存时，根据用户实际打开的上传开关和模型配置决定是否捕获视频/音频。
- `src/domain/replay-status.ts`
  - 状态行只展示真实会被上传的证据类型。
  - 只开音频时不展示图片帧上传统计。
  - 只开图片时不展示音频上传统计。
- `src/side-panel/SidePanelApp.tsx`
  - 在完整面板里显示简短说明：
    - “刚才那个球员是谁？”
    - “刚才进球的是谁？”
    - “刚才解说在说什么？”
  - 图片和音频两个上传开关互相独立。
  - 缺少视觉模型时禁用“上传图片”并提示原因。
  - 缺少 ASR 配置时禁用“上传音频”并提示原因。
  - 停止本地缓存后提示会清理临时图片帧和音频片段。
  - 捕获状态才轮询状态，建议 5 秒一次；非捕获状态不需要持续刷新。

不建议回并：

- 与定制市场按钮绑定的跳转逻辑。
- 任何定制市场预览组件。

### 5. 临时回看证据进入 AI 的边界

当前版本对“音频没识别出来时 AI 乱猜”的问题做了约束。

可回并内容：

- `src/domain/replay-upload.ts`
  - 图片证据和音频证据按用户问题意图判断是否上传。
  - 当用户同时打开图片和音频上传时：
    - 问“刚才发生了什么”可以同时附带图片和音频。
    - 问“解说说了什么”应优先使用 ASR 文本。
    - 如果 ASR 没有可用文本，AI 必须说音频转写不可用，不能根据标题、页面文字或图片猜解说原话。
- `src/services/llm.ts`
  - system prompt 里保留证据边界：
    - ASR 文本是辅助证据。
    - 标点、空文本、provider metadata 不能当成转写。
    - 视觉字幕可以总结，但要标注为视觉证据，不等同于音频转写。

### 6. 数据包设置和下载体验

当前版本对数据包设置做了更清晰的说明，避免用户误以为“拉取已选文件”只拉当前比赛。

可回并内容：

- `src/services/data-package.ts`
  - `onProgress` 回调。
  - 进度字段：
    - `totalFiles`
    - `checkedFiles`
    - `downloadedFiles`
    - `skippedFiles`
    - `downloadedBytes`
    - `currentPath`
- `src/options/OptionsApp.tsx`
  - `Check manifest on startup` 默认开启。
  - 启动时只检查 manifest 和必要核心数据，不重复下载已经缓存的文件。
  - “预载已选层级”改为“加载已选层级的所有历史数据”。
  - 点击大层级前弹确认：
    - “这里会预载整个已选数据层级，不是只拉当前比赛。比赛/球员层级可能下载数万文件；当前比赛上下文会在完整面板自动按需懒加载，无需拉取或设置。确认继续预载吗？”
  - 预载过程中显示 checked / downloaded / skipped / bytes。
- `src/i18n/messages.ts`
  - 数据包设置页中文化。
  - 数据层级名称中文化。
  - 运行核心、当前版本、上次检查、上次拉取等标签中文化。

注意：

- 这部分只回并“数据包管理 UX 和缓存逻辑”。
- 不回并当前项目里为定制市场准备的数据文件。

### 7. 本地识别与 AI 配置解耦

当前版本在弹窗里更明确地区分“本地比赛识别可用”和“AI 是否已配置”。

可回并内容：

- `src/popup/PopupApp.tsx`
  - 比赛识别不依赖用户先配置大模型。
  - 顶部状态显示本地识别 ready。
  - AI 配置状态作为附加小字显示。
- `src/i18n/messages.ts`
  - 增加 `localDetectionReady`
  - 增加 `aiConfiguredShort`

这项对原插件很重要，因为用户打开插件后应该先看到比赛识别结果，而不是被模型配置阻塞。

### 8. 中文/英文文案补齐

可回并内容：

- 数据包设置页中文。
- 临时回看说明中文。
- 缺少视觉模型/ASR 配置的提示中文。
- 供应商切换提示中文。
- Manifest 检查、拉取、回滚、恢复内置数据等状态中文。

注意：

- 原插件仍然应保留自己的产品名和市场文案。
- 不要搬运当前项目里的定制产品名、外部交易入口文案或活动提交文案。

## 建议不要回并的内容

以下内容属于当前独立项目的定制，不适合回到原插件：

- 定制市场服务文件。
- 定制市场 JSON 数据。
- 合约地址、网络 ID、钱包、资产符号、外部交易入口 URL。
- 定制市场 preview 卡片。
- 任何替换原市场服务的 import、message type、按钮文案。
- `PredictionMarketSignal` 中与定制市场池子、合约、结算来源相关的字段。
- README 里面向活动提交或定制 Demo 的说明。

如果原插件继续使用 Polymarket，应保留原来的 `src/services/polymarket.ts`，不要用当前项目的定制市场服务替换。

## 建议回并顺序

1. 回并类型和设置结构。
   - `src/shared/types.ts`
   - `src/services/settings.ts`
   - 新增 `src/shared/provider-presets.ts`

2. 回并设置页供应商预设。
   - `src/options/OptionsApp.tsx`
   - `src/i18n/messages.ts`
   - `src/test/settings.test.ts`

3. 回并 LLM 测试和响应解析。
   - `src/services/llm.ts`
   - `src/test/llm.test.ts`

4. 回并 ASR provider 和转写解析。
   - `src/services/transcription.ts`
   - `src/test/transcription.test.ts`

5. 回并临时回看开关和证据状态。
   - `src/domain/replay-upload.ts`
   - `src/domain/replay-status.ts`
   - `src/shared/chrome-helpers.ts`
   - `src/side-panel/SidePanelApp.tsx`
   - `src/test/replay-upload.test.ts`
   - `src/test/replay-status.test.ts`
   - `src/test/chrome-helpers.test.ts`

6. 回并数据包 UX。
   - `src/services/data-package.ts`
   - `src/options/OptionsApp.tsx`
   - `src/i18n/messages.ts`
   - `src/test/data-package.test.ts`

7. 回并弹窗识别和 AI 配置解耦。
   - `src/popup/PopupApp.tsx`
   - `src/popup/popup.css`
   - `src/i18n/messages.ts`

## 回并后的验证清单

代码验证：

```powershell
npm test
npm run lint
npm run build
```

Chrome smoke test：

1. 加载插件 dist。
2. 不配置 AI，打开 FIFA 或 YouTube 赛事页，确认仍能本地识别比赛。
3. 配置文本模型，点击“测试文本模型”，确认成功/失败提示清楚。
4. 配置视觉模型，确认完整面板“上传图片”可点；清空视觉模型后应禁用并提示。
5. 配置 ASR，确认“上传音频”可点；清空 endpoint/key/model 后应禁用并提示。
6. 开启本地缓存，只开图片、只开音频、两者都开，确认状态行只展示真实启用的证据。
7. 停止本地缓存，确认临时图片帧和音频片段被清理。
8. 设置页切换 LLM/ASR 供应商，确认之前填写的配置能按供应商恢复。
9. 数据包页点击“检查 Manifest”和“拉取最新核心数据”，确认不会重复下载已缓存文件。
10. 点击“加载已选层级的所有历史数据”，确认弹出大层级警告。

## 风险点

- `OptionsApp.tsx` 同时包含设置供应商、数据包、临时回看多块逻辑，回并时容易和原插件已有改动冲突，建议分小提交处理。
- `llm.ts` 的 system prompt 里有市场信号描述，回并时必须保留原插件的市场来源描述，不要搬运当前项目的定制描述。
- `types.ts` 中市场相关字段不要整段复制，只复制 LLM/ASR/settings/replay 需要的类型。
- `messages.ts` 不要直接覆盖，按 key 逐项合并，避免改掉原插件产品名和市场名。
- `background.ts`、`chrome-helpers.ts` 中打开市场弹窗/标签页的 message type 不应回并定制版本。

## 建议拆分提交

1. `feat(settings): add provider presets and per-provider profiles`
2. `fix(llm): harden compatible response parsing and diagnostics`
3. `feat(asr): add transcription provider presets and direct upload support`
4. `fix(replay): gate evidence capture by upload switches and configured models`
5. `feat(data): show package pull progress and clarify selected tier preload`
6. `fix(popup): allow local match detection without configured AI`
7. `i18n: translate data package and replay settings`
