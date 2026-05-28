import type { AnalysisContext, ChatConversationMessage, UserSettings } from "../shared/types";

interface ChatCompletionResponse {
  choices?: Array<{
    text?: string;
    message?: {
      content?: string | Array<{ text?: string; type?: string }>;
      reasoning_content?: string;
    };
  }>;
  output_text?: string;
  output?: Array<{
    content?: Array<{ text?: string; type?: string }>;
  }>;
}

class NonJsonModelResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonJsonModelResponseError";
  }
}

interface ChatCompletionStreamChunk {
  choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
}

type ChatMessageContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: ChatMessageContent;
}

export interface LLMConnectionTestResult {
  ok: boolean;
  status: "available" | "unavailable";
  message: string;
  httpStatus?: number;
  reply?: string;
  testedAt: string;
}

type LLMConnectionTestOptions =
  | string
  | {
      mode?: "text" | "vision";
      prompt?: string;
    };

export async function runMatchAnalysis(input: {
  settings: UserSettings;
  context: AnalysisContext;
  conversation?: ChatConversationMessage[];
  onDelta?: (content: string) => void;
}): Promise<string> {
  const { settings, context, conversation = [], onDelta } = input;

  if (!settings.llm.apiKey || !settings.llm.model || !settings.llm.baseURL) {
    return "Configure your OpenAI-compatible API key, base URL, and model before asking AI questions.";
  }

  const hasReplayFrames = Boolean(context.frames?.length);
  const model = hasReplayFrames && settings.llm.visionModel ? settings.llm.visionModel : settings.llm.model;

  const stream = Boolean(onDelta);
  try {
    const response = await fetch(buildChatCompletionsEndpoint(settings), {
      method: "POST",
      headers: buildChatHeaders(settings),
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a World Cup match analysis assistant. Explain match context, player and team signals, live sports API snapshots, replay transcription, and prediction market movement without giving betting instructions. Use rosterNotes and current key-player data as probable identity hints only: names, shirt numbers, positions, clubs, and rosterStatus can narrow candidates, but simulated/provisional data is not final and must be labelled as such. If replay frames are attached, prioritize visible evidence from the frames over roster hints, and explicitly say when the frame appears to contradict the selected match context. If transcript is present, treat it as ASR text from the user's configured transcription provider; use it as auxiliary evidence for commentary, names, score calls, and timing, but allow for recognition errors. When the user asks what was said, separate raw ASR transcript from your summary: label quoted ASR text as transcript evidence and label your interpretation as a summary. If the user asks what the audio, voice, commentary, narration, or announcer said and the current context has no transcript or says the ASR provider returned no usable speech text, state that the audio transcript is unavailable; do not infer spoken words from page title, prior conversation, visible subtitles, replay frames, provider metadata, punctuation-only output, or raw provider payloads. Never turn punctuation-only ASR output such as '.' into words or a quoted transcript. For mixed visual-plus-audio questions, separate visual observations from commentary and clearly label any visible subtitle summary as visual evidence, not audio transcription. Use liveSportsContext as user-key sports API data, and use predictionMarketContext and marketSignals as X Layer USDT0 pool-implied odds and liquidity data, not as trading advice. If matchSelection.mode is manual, treat that match as the user's chosen context even if automatic candidates differ."
          },
          buildCurrentContextMessage(context),
          ...conversation.slice(-8)
        ] satisfies ChatMessage[],
        stream,
        temperature: 0.2
      })
    });

    if (!response.ok) {
      return `The configured model request failed with HTTP ${response.status}. Check your endpoint, key, and model.`;
    }

    if (stream && response.body) {
      const streamed = await readChatCompletionStream(response, onDelta);
      return streamed || "The model returned no answer.";
    }

    const json = await parseChatCompletionJson(response);
    return extractAssistantText(json) ?? "The model returned no answer.";
  } catch (error) {
    return `The configured model request failed. ${formatModelResponseError(error)}`;
  }
}

export async function testLLMConnection(
  settings: UserSettings,
  options: LLMConnectionTestOptions = "hi"
): Promise<LLMConnectionTestResult> {
  const testedAt = new Date().toISOString();
  const mode = typeof options === "string" ? "text" : options.mode ?? "text";
  const prompt = typeof options === "string" ? options : options.prompt ?? "hi";
  const missing = getMissingLLMSettings(settings, mode);

  if (missing.length > 0) {
    return {
      ok: false,
      status: "unavailable",
      message: `Missing ${missing.join(", ")}. Configure Base URL, API key, and model before testing.`,
      testedAt
    };
  }

  try {
    const model = mode === "vision" ? settings.llm.visionModel : settings.llm.model;
    if (mode === "vision" && !model) {
      return {
        ok: false,
        status: "unavailable",
        message: "Missing Vision model. Configure a vision-capable model before testing video/image analysis.",
        testedAt
      };
    }

    const response = await fetch(buildChatCompletionsEndpoint(settings), {
      method: "POST",
      headers: buildChatHeaders(settings),
      body: JSON.stringify({
        model,
        messages: buildConnectionTestMessages(mode, prompt),
        temperature: 0,
        max_tokens: 96
      })
    });

    if (!response.ok) {
      const details = summarizeResponseText(await response.text());
      return {
        ok: false,
        status: "unavailable",
        message: `Model test failed with HTTP ${response.status}. Check Base URL, API key, and model. Provider response: ${details}.`,
        httpStatus: response.status,
        testedAt
      };
    }

    const json = await parseChatCompletionJson(response);
    const reply = extractAssistantText(json);

    if (!reply) {
      return {
        ok: false,
        status: "unavailable",
        message: `Model endpoint responded, but returned no assistant message. Response shape: ${summarizeResponsePayload(json)}.`,
        testedAt
      };
    }

    return {
      ok: true,
      status: "available",
      message: "Model is available.",
      reply,
      testedAt
    };
  } catch (error) {
    return {
      ok: false,
      status: "unavailable",
      message: error instanceof NonJsonModelResponseError
        ? `Model test failed. ${error.message}`
        : `Model test could not reach the endpoint. ${formatError(error)}`,
      testedAt
    };
  }
}

async function parseChatCompletionJson(response: Response): Promise<ChatCompletionResponse> {
  const text = await response.text();
  try {
    return JSON.parse(text) as ChatCompletionResponse;
  } catch (error) {
    throw new NonJsonModelResponseError(
      `Model endpoint returned a non-JSON response. Check that Base URL points to an OpenAI-compatible API root and that /chat/completions is valid. Response starts with: ${summarizeResponseText(text)}`
    );
  }
}

function summarizeResponseText(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.slice(0, 120) || "<empty response>";
}

function formatModelResponseError(error: unknown): string {
  if (error instanceof NonJsonModelResponseError) return error.message;
  return formatError(error);
}

function buildConnectionTestMessages(mode: "text" | "vision", prompt: string): ChatMessage[] {
  if (mode === "vision") {
    return [
      {
        role: "system",
        content: "Reply with a short acknowledgement that image input is readable."
      },
      {
        role: "user",
        content: [
          { type: "text", text: `${prompt}. This is a tiny image input test.` },
          {
            type: "image_url",
            image_url: {
              url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAYElEQVR42u3QAQ0AAAwCIPuX1hzfIQLpcxEgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQIECBAgQIAAAQLuG0bQw7Ko2TvAAAAAAElFTkSuQmCC"
            }
          }
        ]
      }
    ];
  }

  return [
    {
      role: "system",
      content: "Reply with a short acknowledgement."
    },
    {
      role: "user",
      content: prompt
    }
  ];
}

function buildChatCompletionsEndpoint(settings: UserSettings): string {
  return `${normalizeChatBaseURL(settings.llm.baseURL)}/chat/completions`;
}

function buildChatHeaders(settings: UserSettings): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${settings.llm.apiKey}`
  };
}

function buildCurrentContextMessage(context: AnalysisContext): ChatMessage {
  const frameCount = context.frames?.length ?? 0;
  const compactContext = frameCount
    ? {
        ...context,
        frames: context.frames?.map((_, index) => `attached replay frame ${index + 1}`)
      }
    : context;
  const text = `Use this current match context for the conversation:\n${JSON.stringify(compactContext, null, 2)}`;

  if (!frameCount) {
    return {
      role: "user",
      content: text
    };
  }

  return {
    role: "user",
    content: [
      { type: "text", text },
      ...context.frames!.map((url) => ({
        type: "image_url" as const,
        image_url: { url }
      }))
    ]
  };
}

async function readChatCompletionStream(
  response: Response,
  onDelta?: (content: string) => void
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";

  function consumeLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return;

    try {
      const chunk = JSON.parse(data) as ChatCompletionStreamChunk;
      const delta =
        chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content ?? "";
      if (!delta) return;
      content += delta;
      onDelta?.(content);
    } catch {
      return;
    }
  }

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      consumeLine(line);
    }
  }

  if (buffer.trim()) consumeLine(buffer);

  return content;
}

function getMissingLLMSettings(settings: UserSettings, mode: "text" | "vision" = "text"): string[] {
  return [
    settings.llm.baseURL ? null : "Base URL",
    settings.llm.apiKey ? null : "API key",
    mode === "vision"
      ? settings.llm.visionModel ? null : "Vision model"
      : settings.llm.model ? null : "model"
  ].filter((item): item is string => item !== null);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeChatBaseURL(baseURL: string): string {
  const trimmed = baseURL.trim().replace(/\/$/, "");
  try {
    const url = new URL(trimmed);
    if (url.pathname === "/1") {
      url.pathname = "/v1";
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

function extractAssistantText(payload: ChatCompletionResponse): string | undefined {
  const values: unknown[] = [
    payload.output_text,
    ...((payload.output ?? []).flatMap((item) => item.content?.map((content) => content.text) ?? [])),
    ...((payload.choices ?? []).flatMap((choice) => [
      choice.text,
      choice.message?.content,
      choice.message?.reasoning_content
    ]))
  ];

  for (const value of values) {
    const text = normalizeAssistantText(value);
    if (text) return text;
  }
  return undefined;
}

function normalizeAssistantText(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (!Array.isArray(value)) return undefined;
  const text = value
    .map((item) => item?.text)
    .filter((item): item is string => typeof item === "string")
    .join("")
    .trim();
  return text || undefined;
}

function summarizeResponsePayload(payload: unknown): string {
  try {
    return JSON.stringify(payload).replace(/\s+/g, " ").slice(0, 180);
  } catch {
    return "<unserializable response>";
  }
}
