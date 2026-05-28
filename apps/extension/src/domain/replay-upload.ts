import type { UserSettings } from "../shared/types";

export const MAX_REPLAY_AUDIO_UPLOAD_SECONDS = 30;

const GENERAL_REPLAY_PROMPT =
  /刚才|刚刚|前面|上一|那球|回放|发生了什么|怎么样|replay|rewind|just now|what happened|last play|previous/i;

const VISION_REPLAY_PROMPT =
  /那个人|那位|视频|画面|镜头|场上|进球|谁进了球|球员|号码|比分牌|庆祝|射门|扑救|犯规|红牌|黄牌|footage|clip|screen|frame|that player|who scored|goal|player|jersey|number|scoreboard|celebration|shot|save|foul|red card|yellow card/i;

const AUDIO_REPLAY_PROMPT =
  /语音|音频|声音|解说|旁白|播报|听到|听写|说了什么|在说什么|讲了什么|说什么|audio|voice|sound|commentary|commentator|announcer|narration|said|saying|say|what did.*say|what.*saying/i;

export function shouldUploadReplayFrames(settings: UserSettings, question: string): boolean {
  const intent = classifyReplayQuestion(question);
  return Boolean(
    hasReplayVisionModel(settings) &&
      settings.replay.mode !== "audio-only" &&
      settings.replay.uploadFramesToAI &&
      !intent.audioOnly &&
      (intent.visual || intent.general)
  );
}

export function shouldUploadReplayAudio(settings: UserSettings, question?: string): boolean {
  const intent = question ? classifyReplayQuestion(question) : { audio: true, general: true, visual: false, audioOnly: false };
  return Boolean(
    settings.replay.uploadAudioToASR &&
      hasReplayAudioModel(settings) &&
      (intent.audio || intent.visual || intent.general)
  );
}

export function getReplayAudioUploadWindowSeconds(settings: UserSettings): number {
  return Math.min(settings.transcription.maxSeconds, MAX_REPLAY_AUDIO_UPLOAD_SECONDS);
}

export function hasReplayVisionModel(settings?: UserSettings): boolean {
  return Boolean(settings?.llm.visionModel?.trim());
}

export function getReplayAudioMissingRequirements(settings?: UserSettings): string[] {
  const missing: string[] = [];
  if (!settings?.transcription.endpoint?.trim()) missing.push("ASR endpoint");
  if (!settings?.transcription.apiKey?.trim()) missing.push("ASR API key");
  if (!settings?.transcription.model?.trim()) missing.push("ASR model");
  return missing;
}

export function hasReplayAudioModel(settings?: UserSettings): boolean {
  return getReplayAudioMissingRequirements(settings).length === 0;
}

function classifyReplayQuestion(question: string): {
  audio: boolean;
  visual: boolean;
  general: boolean;
  audioOnly: boolean;
} {
  const audio = AUDIO_REPLAY_PROMPT.test(question);
  const visual = VISION_REPLAY_PROMPT.test(question);
  const general = GENERAL_REPLAY_PROMPT.test(question);
  return {
    audio,
    visual,
    general,
    audioOnly: audio && !visual
  };
}
