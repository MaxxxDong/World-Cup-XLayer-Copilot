import type { LLMProviderPreset, TranscriptionProviderPreset } from "./types";

export interface ProviderLink {
  label: string;
  href: string;
}

export interface LLMProviderOption {
  id: LLMProviderPreset;
  label: string;
  region: "global" | "china" | "multi";
  baseURL: string;
  model: string;
  visionModel?: string;
  description: {
    en: string;
    zh: string;
  };
  links: ProviderLink[];
}

export interface TranscriptionProviderOption {
  id: TranscriptionProviderPreset;
  label: string;
  region: "global" | "china" | "multi";
  endpoint: string;
  model: string;
  directUpload: boolean;
  description: {
    en: string;
    zh: string;
  };
  links: ProviderLink[];
}

export const LLM_PROVIDER_OPTIONS: LLMProviderOption[] = [
  {
    id: "openai",
    label: "OpenAI",
    region: "global",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-5.2",
    visionModel: "gpt-5.2",
    description: {
      en: "OpenAI-compatible Chat Completions. Use your own OpenAI API key.",
      zh: "OpenAI Chat Completions 兼容接口，使用你自己的 OpenAI API Key。"
    },
    links: [
      { label: "API keys", href: "https://platform.openai.com/api-keys" },
      { label: "Models", href: "https://platform.openai.com/docs/models" }
    ]
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    region: "global",
    baseURL: "https://openrouter.ai/api/v1",
    model: "openai/gpt-5.2",
    visionModel: "openai/gpt-5.2",
    description: {
      en: "OpenAI-compatible model router. Model IDs must include the provider prefix.",
      zh: "OpenAI 兼容模型路由，模型名通常需要带供应商前缀。"
    },
    links: [
      { label: "Quickstart", href: "https://openrouter.ai/docs/quickstart" },
      { label: "Models", href: "https://openrouter.ai/models" }
    ]
  },
  {
    id: "google-gemini",
    label: "Google Gemini",
    region: "global",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    model: "gemini-2.5-flash",
    visionModel: "gemini-2.5-flash",
    description: {
      en: "Gemini OpenAI compatibility endpoint from Google AI Studio.",
      zh: "Google AI Studio 的 Gemini OpenAI 兼容接口。"
    },
    links: [
      { label: "OpenAI compatibility", href: "https://ai.google.dev/gemini-api/docs/openai" },
      { label: "API key", href: "https://aistudio.google.com/apikey" }
    ]
  },
  {
    id: "xai-grok",
    label: "xAI Grok",
    region: "global",
    baseURL: "https://api.x.ai/v1",
    model: "grok-4.3",
    visionModel: "grok-4.3",
    description: {
      en: "xAI OpenAI-compatible Chat Completions endpoint.",
      zh: "xAI 的 OpenAI 兼容 Chat Completions 接口。"
    },
    links: [
      { label: "Docs", href: "https://docs.x.ai/docs/guides/chat-completions" },
      { label: "API keys", href: "https://console.x.ai/" }
    ]
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    region: "china",
    baseURL: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    visionModel: "",
    description: {
      en: "OpenAI-compatible DeepSeek text models. Vision is not preset here.",
      zh: "DeepSeek OpenAI 兼容文本模型；这里不预设视觉模型。"
    },
    links: [
      { label: "API docs", href: "https://api-docs.deepseek.com/" },
      { label: "Models", href: "https://api-docs.deepseek.com/api/list-models" }
    ]
  },
  {
    id: "aliyun-dashscope",
    label: "Aliyun DashScope",
    region: "china",
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    visionModel: "qwen3-vl-plus",
    description: {
      en: "Alibaba Cloud Model Studio OpenAI-compatible endpoint.",
      zh: "阿里云百炼 OpenAI 兼容接口。"
    },
    links: [
      { label: "API key", href: "https://help.aliyun.com/zh/model-studio/developer-reference/get-api-key" },
      { label: "Vision models", href: "https://help.aliyun.com/zh/model-studio/qwen-vl-compatible-with-openai" }
    ]
  },
  {
    id: "tencent-hunyuan",
    label: "Tencent Hunyuan",
    region: "china",
    baseURL: "https://api.hunyuan.cloud.tencent.com/v1",
    model: "hunyuan-turbos-latest",
    visionModel: "hunyuan-vision",
    description: {
      en: "Tencent Hunyuan OpenAI-compatible endpoint.",
      zh: "腾讯混元 OpenAI 兼容接口。"
    },
    links: [
      { label: "OpenAI compatibility", href: "https://cloud.tencent.com/document/product/1729/111007" },
      { label: "Console", href: "https://console.cloud.tencent.com/hunyuan" }
    ]
  },
  {
    id: "volcengine-ark",
    label: "Volcengine Ark",
    region: "china",
    baseURL: "https://ark.cn-beijing.volces.com/api/v3",
    model: "doubao-seed-2-0-lite-260215",
    visionModel: "doubao-seed-1-6-vision-250815",
    description: {
      en: "Volcengine Ark OpenAI-compatible endpoint. Replace model with your endpoint/model ID.",
      zh: "火山方舟 OpenAI 兼容接口；模型名按你的接入点/模型 ID 修改。"
    },
    links: [
      { label: "Base URL", href: "https://www.volcengine.com/docs/82379/1298459" },
      { label: "Chat API", href: "https://www.volcengine.com/docs/82379/1494384" }
    ]
  },
  {
    id: "zhipu-bigmodel",
    label: "Zhipu BigModel",
    region: "china",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4.5",
    visionModel: "glm-4.5v",
    description: {
      en: "Zhipu BigModel OpenAI-compatible endpoint.",
      zh: "智谱 BigModel OpenAI 兼容接口。"
    },
    links: [
      { label: "OpenAI compatibility", href: "https://docs.bigmodel.cn/cn/guide/develop/openai/introduction" },
      { label: "GLM-4.5V", href: "https://docs.bigmodel.cn/cn/guide/models/vlm/glm-4.5v" }
    ]
  },
  {
    id: "moonshot-kimi",
    label: "Moonshot Kimi",
    region: "china",
    baseURL: "https://api.moonshot.cn/v1",
    model: "kimi-k2.5",
    visionModel: "",
    description: {
      en: "Kimi OpenAI-compatible API. Use the .ai endpoint for global keys.",
      zh: "Kimi OpenAI 兼容接口；国际站 Key 可改为 .ai endpoint。"
    },
    links: [
      { label: "China docs", href: "https://platform.kimi.com/docs/api/overview" },
      { label: "Global docs", href: "https://platform.kimi.ai/docs/api/overview" }
    ]
  },
  {
    id: "custom",
    label: "Custom OpenAI-compatible",
    region: "multi",
    baseURL: "",
    model: "",
    visionModel: "",
    description: {
      en: "Use any OpenAI-compatible chat endpoint.",
      zh: "使用任意 OpenAI 兼容 Chat endpoint。"
    },
    links: []
  }
];

export const TRANSCRIPTION_PROVIDER_OPTIONS: TranscriptionProviderOption[] = [
  {
    id: "openai-transcribe",
    label: "OpenAI Transcribe",
    region: "global",
    endpoint: "https://api.openai.com/v1/audio/transcriptions",
    model: "gpt-4o-mini-transcribe",
    directUpload: true,
    description: {
      en: "Direct multipart upload to OpenAI Audio Transcriptions.",
      zh: "直接以 multipart 方式上传到 OpenAI Audio Transcriptions。"
    },
    links: [
      { label: "Speech to text", href: "https://platform.openai.com/docs/guides/speech-to-text" },
      { label: "API keys", href: "https://platform.openai.com/api-keys" }
    ]
  },
  {
    id: "groq-whisper",
    label: "Groq Whisper",
    region: "global",
    endpoint: "https://api.groq.com/openai/v1/audio/transcriptions",
    model: "whisper-large-v3-turbo",
    directUpload: true,
    description: {
      en: "Fast OpenAI-compatible Whisper transcription endpoint.",
      zh: "Groq 的高速 OpenAI 兼容 Whisper 转写接口。"
    },
    links: [
      { label: "Speech to text", href: "https://console.groq.com/docs/speech-to-text" },
      { label: "API keys", href: "https://console.groq.com/keys" }
    ]
  },
  {
    id: "deepgram-nova",
    label: "Deepgram Nova",
    region: "global",
    endpoint: "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&detect_language=true",
    model: "nova-3",
    directUpload: true,
    description: {
      en: "Direct audio upload to Deepgram Nova with Token authentication.",
      zh: "直接上传音频到 Deepgram Nova，使用 Token 鉴权。"
    },
    links: [
      { label: "Models", href: "https://developers.deepgram.com/docs/models-languages-overview" },
      { label: "API keys", href: "https://console.deepgram.com/" }
    ]
  },
  {
    id: "aliyun-dashscope-asr",
    label: "Aliyun DashScope Qwen ASR",
    region: "china",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen3-asr-flash",
    directUpload: true,
    description: {
      en: "Qwen ASR over DashScope OpenAI-compatible chat completions.",
      zh: "通过阿里百炼 OpenAI 兼容 chat completions 调用 Qwen ASR。"
    },
    links: [
      { label: "Qwen ASR", href: "https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference" },
      { label: "API key", href: "https://help.aliyun.com/zh/model-studio/developer-reference/get-api-key" }
    ]
  },
  {
    id: "tencent-cloud-asr",
    label: "Tencent Cloud ASR",
    region: "china",
    endpoint: "https://asr.tencentcloudapi.com",
    model: "16k_zh",
    directUpload: false,
    description: {
      en: "Official API uses Tencent Cloud signing. Use a server-side adapter and configure it as Custom.",
      zh: "官方接口需要腾讯云签名；请用服务端 adapter 后在自定义里配置。"
    },
    links: [
      { label: "One-sentence ASR", href: "https://cloud.tencent.com/document/api/1093/35646" },
      { label: "Console", href: "https://console.cloud.tencent.com/asr" }
    ]
  },
  {
    id: "volcengine-doubao-asr",
    label: "Volcengine Doubao ASR",
    region: "china",
    endpoint: "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel",
    model: "bigmodel",
    directUpload: false,
    description: {
      en: "Official ASR uses a streaming WebSocket/binary protocol. Use a server-side adapter and configure it as Custom.",
      zh: "官方 ASR 是流式 WebSocket/二进制协议；请用服务端 adapter 后在自定义里配置。"
    },
    links: [
      { label: "Streaming ASR", href: "https://www.volcengine.com/docs/6561/1354869" },
      { label: "Access keys", href: "https://www.volcengine.com/docs/6291/65568" }
    ]
  },
  {
    id: "custom",
    label: "Custom HTTP ASR",
    region: "multi",
    endpoint: "",
    model: "",
    directUpload: true,
    description: {
      en: "Use your own HTTP endpoint that accepts multipart file, model, provider, and language fields.",
      zh: "使用自己的 HTTP endpoint，接收 multipart file/model/provider/language 字段。"
    },
    links: []
  }
];

export function getLLMProviderOption(id: LLMProviderPreset): LLMProviderOption {
  return LLM_PROVIDER_OPTIONS.find((option) => option.id === id) ?? LLM_PROVIDER_OPTIONS[0];
}

export function getTranscriptionProviderOption(id: TranscriptionProviderPreset): TranscriptionProviderOption {
  return TRANSCRIPTION_PROVIDER_OPTIONS.find((option) => option.id === id) ?? TRANSCRIPTION_PROVIDER_OPTIONS[0];
}

export function normalizeLLMProvider(value: unknown): LLMProviderPreset {
  return LLM_PROVIDER_OPTIONS.some((option) => option.id === value) ? value as LLMProviderPreset : "openai";
}

export function normalizeTranscriptionProvider(value: unknown): TranscriptionProviderPreset {
  return TRANSCRIPTION_PROVIDER_OPTIONS.some((option) => option.id === value)
    ? value as TranscriptionProviderPreset
    : "openai-transcribe";
}
