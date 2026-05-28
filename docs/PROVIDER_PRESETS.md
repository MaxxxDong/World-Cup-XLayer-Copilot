# Provider Presets

The Chrome extension stores user keys only in local extension storage. Presets only fill editable fields; users still provide their own API keys and model access.

## LLM providers

The extension calls OpenAI-compatible `POST /chat/completions`. Use these presets only with providers that expose that interface.

| Preset | Base URL | Text model | Vision model | Notes |
| --- | --- | --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-5.2` | `gpt-5.2` | OpenAI API key from Platform. |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-5.2` | `openai/gpt-5.2` | Model IDs usually include a provider prefix. |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` | `gemini-2.5-flash` | Google AI Studio OpenAI compatibility endpoint. |
| xAI Grok | `https://api.x.ai/v1` | `grok-4.3` | `grok-4.3` | OpenAI-compatible xAI Chat Completions endpoint. |
| DeepSeek | `https://api.deepseek.com` | `deepseek-v4-flash` | blank | Text-only preset in this extension. |
| Aliyun DashScope | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | `qwen3-vl-plus` | Alibaba Cloud Model Studio OpenAI-compatible mode. |
| Tencent Hunyuan | `https://api.hunyuan.cloud.tencent.com/v1` | `hunyuan-turbos-latest` | `hunyuan-vision` | Tencent Hunyuan OpenAI-compatible endpoint. |
| Volcengine Ark | `https://ark.cn-beijing.volces.com/api/v3` | `doubao-seed-2-0-lite-260215` | `doubao-seed-1-6-vision-250815` | Replace the model with the endpoint/model ID enabled in Ark. |
| Zhipu BigModel | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.5` | `glm-4.5v` | BigModel OpenAI-compatible endpoint. |
| Moonshot Kimi | `https://api.moonshot.cn/v1` | `kimi-k2.5` | blank | Global users can switch to `https://api.moonshot.ai/v1`. |

## ASR providers

The buffered replay uploader can directly call simple HTTP upload APIs. Providers that require vendor signing, streaming WebSocket sessions, or multi-step SDK flows need a small server-side adapter; configure that adapter as `Custom HTTP ASR`.

| Preset | Endpoint | Model | Direct from extension | Notes |
| --- | --- | --- | --- | --- |
| OpenAI Transcribe | `https://api.openai.com/v1/audio/transcriptions` | `gpt-4o-mini-transcribe` | Yes | Multipart upload with Bearer key. |
| Groq Whisper | `https://api.groq.com/openai/v1/audio/transcriptions` | `whisper-large-v3-turbo` | Yes | OpenAI-compatible transcription endpoint. |
| Deepgram Nova | `https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&detect_language=true` | `nova-3` | Yes | Raw audio upload with `Authorization: Token ...`. |
| Aliyun DashScope Qwen ASR | `https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions` | `qwen3-asr-flash` | Yes | Uses Qwen ASR through OpenAI-compatible chat content. |
| Tencent Cloud ASR | `https://asr.tencentcloudapi.com` | `16k_zh` | No | Official API needs Tencent Cloud request signing. |
| Volcengine Doubao ASR | `wss://openspeech.bytedance.com/api/v3/sauc/bigmodel` | `bigmodel` | No | Official API is streaming/binary; use a server-side adapter. |

## Verification sources

- OpenAI models and audio transcription docs: `https://platform.openai.com/docs/models`, `https://platform.openai.com/docs/guides/speech-to-text`
- OpenRouter quickstart: `https://openrouter.ai/docs/quickstart`
- Google Gemini OpenAI compatibility: `https://ai.google.dev/gemini-api/docs/openai`
- xAI Chat Completions: `https://docs.x.ai/docs/guides/chat-completions`
- DeepSeek API docs: `https://api-docs.deepseek.com/`
- Alibaba Model Studio docs: `https://help.aliyun.com/zh/model-studio/`
- Tencent Hunyuan and ASR docs: `https://cloud.tencent.com/document/product/1729/111007`, `https://cloud.tencent.com/document/api/1093/35646`
- Volcengine Ark and ASR docs: `https://www.volcengine.com/docs/82379/1298459`, `https://www.volcengine.com/docs/6561/1354869`
- Zhipu BigModel docs: `https://docs.bigmodel.cn/cn/guide/develop/openai/introduction`
- Moonshot Kimi docs: `https://platform.kimi.com/docs/api/overview`
- Groq speech-to-text docs: `https://console.groq.com/docs/speech-to-text`
- Deepgram model docs: `https://developers.deepgram.com/docs/models-languages-overview`
