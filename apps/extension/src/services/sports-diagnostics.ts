import type { UserSettings } from "../shared/types";

export type SportsDiagnosticProvider = "football-data.org" | "API-Football";

export type SportsDiagnosticStatus = "skipped" | "ok" | "http-error" | "network-error";

export interface SportsDiagnosticProbe {
  provider: SportsDiagnosticProvider;
  label: string;
  endpoint: string;
  status: SportsDiagnosticStatus;
  httpStatus?: number;
  durationMs?: number;
  rateLimitHeaders: Record<string, string>;
  topLevelFields: string[];
  samplePath?: string;
  sampleFields: string[];
  itemCount?: number;
  message: string;
  bodyPreview?: string;
}

export interface SportsDiagnosticsResult {
  ranAt: string;
  concurrency: number;
  probes: SportsDiagnosticProbe[];
}

interface ProbeDefinition {
  provider: SportsDiagnosticProvider;
  label: string;
  endpoint: string;
  headers: Record<string, string>;
  configured: boolean;
}

const BODY_PREVIEW_LIMIT = 420;
const MAX_FIELDS = 24;

export async function runSportsDiagnostics(settings: UserSettings): Promise<SportsDiagnosticsResult> {
  const probes = buildProbeDefinitions(settings);
  const configured = probes.filter((probe) => probe.configured);
  const skipped = probes
    .filter((probe) => !probe.configured)
    .map((probe) => skippedProbe(probe));

  const completed: SportsDiagnosticProbe[] = [];
  for (const probe of configured) {
    try {
      completed.push(await runProbe(probe, settings));
    } catch (error) {
      completed.push(networkErrorProbe(probe, error, settings));
    }
  }

  return {
    ranAt: new Date().toISOString(),
    concurrency: configured.length ? 1 : 0,
    probes: [...completed, ...skipped]
  };
}

function buildProbeDefinitions(settings: UserSettings): ProbeDefinition[] {
  const apiFootballKey = settings.sports.apiFootballKey?.trim();
  const footballDataKey = settings.sports.footballDataKey?.trim();

  return [
    {
      provider: "API-Football",
      label: "Account status",
      endpoint: "https://v3.football.api-sports.io/status",
      headers: apiFootballKey ? { "x-apisports-key": apiFootballKey } : {},
      configured: Boolean(apiFootballKey)
    },
    {
      provider: "football-data.org",
      label: "World Cup access",
      endpoint: "https://api.football-data.org/v4/competitions/WC",
      headers: footballDataKey ? { "X-Auth-Token": footballDataKey } : {},
      configured: Boolean(footballDataKey)
    }
  ];
}

async function runProbe(probe: ProbeDefinition, settings: UserSettings): Promise<SportsDiagnosticProbe> {
  const started = performance.now();

  try {
    const response = await fetch(probe.endpoint, {
      headers: probe.headers
    });
    const durationMs = Math.round(performance.now() - started);
    const text = await response.text();
    const payload = parseJson(text);
    const summary = summarizePayload(payload);
    const redactedPreview = redactSecrets(
      typeof payload === "undefined" ? text : JSON.stringify(payload),
      settings
    ).slice(0, BODY_PREVIEW_LIMIT);

    return {
      provider: probe.provider,
      label: probe.label,
      endpoint: probe.endpoint,
      status: response.ok ? "ok" : "http-error",
      httpStatus: response.status,
      durationMs,
      rateLimitHeaders: collectRateLimitHeaders(response.headers),
      topLevelFields: summary.topLevelFields,
      samplePath: summary.samplePath,
      sampleFields: summary.sampleFields,
      itemCount: summary.itemCount,
      message: response.ok
        ? `OK. ${summary.message}`
        : `HTTP ${response.status}. ${summary.message}`,
      bodyPreview: redactedPreview
    };
  } catch (error) {
    return networkErrorProbe(probe, error, settings);
  }
}

function skippedProbe(probe: ProbeDefinition): SportsDiagnosticProbe {
  return {
    provider: probe.provider,
    label: probe.label,
    endpoint: probe.endpoint,
    status: "skipped",
    rateLimitHeaders: {},
    topLevelFields: [],
    sampleFields: [],
    message: `${probe.provider} key is not configured.`
  };
}

function networkErrorProbe(
  probe: ProbeDefinition,
  error: unknown,
  settings: UserSettings
): SportsDiagnosticProbe {
  return {
    provider: probe.provider,
    label: probe.label,
    endpoint: probe.endpoint,
    status: "network-error",
    rateLimitHeaders: {},
    topLevelFields: [],
    sampleFields: [],
    message: redactSecrets(error instanceof Error ? error.message : String(error), settings)
  };
}

function parseJson(text: string): unknown {
  if (!text.trim()) return undefined;

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function summarizePayload(payload: unknown): {
  topLevelFields: string[];
  samplePath?: string;
  sampleFields: string[];
  itemCount?: number;
  message: string;
} {
  const topLevelFields = isRecord(payload) ? Object.keys(payload).slice(0, MAX_FIELDS) : [];
  const sample = findSample(payload);

  if (!sample) {
    return {
      topLevelFields,
      sampleFields: [],
      message: topLevelFields.length ? "No array sample found." : "No JSON object fields found."
    };
  }

  return {
    topLevelFields,
    samplePath: sample.path,
    sampleFields: isRecord(sample.value) ? Object.keys(sample.value).slice(0, MAX_FIELDS) : [],
    itemCount: sample.count,
    message: `${sample.path} exposes ${sample.count} item(s).`
  };
}

function findSample(payload: unknown): { path: string; value: unknown; count: number } | undefined {
  if (Array.isArray(payload)) {
    return payload.length ? { path: "root[]", value: payload[0], count: payload.length } : undefined;
  }

  if (!isRecord(payload)) return undefined;

  for (const key of ["response", "matches", "competitions", "areas", "result", "data"]) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value.length ? { path: `${key}[]`, value: value[0], count: value.length } : { path: `${key}[]`, value: undefined, count: 0 };
    }
  }

  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      return value.length ? { path: `${key}[]`, value: value[0], count: value.length } : { path: `${key}[]`, value: undefined, count: 0 };
    }
  }

  return { path: "root", value: payload, count: 1 };
}

function collectRateLimitHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (/rate|limit|request|quota|retry/i.test(key)) {
      result[key] = value;
    }
  });
  return result;
}

function redactSecrets(value: string, settings: UserSettings): string {
  let redacted = value;
  for (const secret of [settings.sports.apiFootballKey, settings.sports.footballDataKey]) {
    const trimmed = secret?.trim();
    if (!trimmed) continue;
    redacted = redacted.split(trimmed).join("[redacted]");
  }
  return redacted;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
