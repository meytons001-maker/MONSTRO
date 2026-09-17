import { ModelRouter, type AiCapability } from "./index.js";
import { OpenAiCompatibleProvider } from "./openai-compatible.js";

export interface AiEnvironment {
  MONSTRO_AI_BASE_URL?: string;
  MONSTRO_AI_MODEL?: string;
  MONSTRO_AI_PROVIDER_ID?: string;
  MONSTRO_AI_API_KEY?: string;
  MONSTRO_AI_CAPABILITIES?: string;
  MONSTRO_AI_TIMEOUT_MS?: string;
}

const KNOWN_CAPABILITIES: ReadonlySet<string> = new Set(["reasoning", "code", "vision", "image", "embedding"] satisfies AiCapability[]);

function capabilities(value?: string): AiCapability[] {
  if (!value?.trim()) return ["reasoning", "code"];
  const parsed = value.split(",").map((item) => item.trim()).filter(Boolean);
  const unknown = parsed.filter((item) => !KNOWN_CAPABILITIES.has(item));
  if (unknown.length) throw new Error(`Unknown MONSTRO AI capabilities: ${unknown.join(", ")}`);
  return [...new Set(parsed)] as AiCapability[];
}

function timeout(value?: string): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error("MONSTRO_AI_TIMEOUT_MS must be a positive integer");
  return parsed;
}

export function createModelRouterFromEnvironment(env: Readonly<Record<string, string | undefined>> = process.env): ModelRouter {
  const baseUrl = env.MONSTRO_AI_BASE_URL?.trim();
  const model = env.MONSTRO_AI_MODEL?.trim();
  if (!baseUrl && !model) return new ModelRouter();
  if (!baseUrl || !model) throw new Error("MONSTRO_AI_BASE_URL and MONSTRO_AI_MODEL must be configured together");

  return new ModelRouter().register(new OpenAiCompatibleProvider({
    id: env.MONSTRO_AI_PROVIDER_ID?.trim() || "default",
    baseUrl,
    model,
    apiKey: env.MONSTRO_AI_API_KEY?.trim() || undefined,
    capabilities: capabilities(env.MONSTRO_AI_CAPABILITIES),
    timeoutMs: timeout(env.MONSTRO_AI_TIMEOUT_MS),
  }));
}
