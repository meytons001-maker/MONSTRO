export type AiCapability = "reasoning" | "code" | "vision" | "image" | "embedding";

export interface AiRequest {
  capability: AiCapability;
  prompt: string;
  system?: string;
  preferredProvider?: string;
  metadata?: Record<string, unknown>;
}

export interface AiResponse {
  provider: string;
  model: string;
  output: string;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface AiProvider {
  readonly id: string;
  readonly capabilities: ReadonlySet<AiCapability>;
  generate(request: AiRequest): Promise<AiResponse>;
}

export class AiRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiRoutingError";
  }
}

export class ModelRouter {
  private readonly providers = new Map<string, AiProvider>();

  register(provider: AiProvider): this {
    if (!provider.id.trim()) throw new AiRoutingError("AI provider id must not be empty");
    if (this.providers.has(provider.id)) throw new AiRoutingError(`AI provider already registered: ${provider.id}`);
    this.providers.set(provider.id, provider);
    return this;
  }

  list(capability?: AiCapability): AiProvider[] {
    return [...this.providers.values()].filter((provider) => !capability || provider.capabilities.has(capability));
  }

  resolve(request: AiRequest): AiProvider {
    if (request.preferredProvider) {
      const preferred = this.providers.get(request.preferredProvider);
      if (!preferred) throw new AiRoutingError(`Unknown AI provider: ${request.preferredProvider}`);
      if (!preferred.capabilities.has(request.capability)) throw new AiRoutingError(`AI provider ${preferred.id} does not support ${request.capability}`);
      return preferred;
    }
    const provider = this.list(request.capability)[0];
    if (!provider) throw new AiRoutingError(`No AI provider supports ${request.capability}`);
    return provider;
  }

  async generate(request: AiRequest): Promise<AiResponse> {
    if (!request.prompt.trim()) throw new AiRoutingError("AI prompt must not be empty");
    return this.resolve(request).generate(request);
  }
}

export { OpenAiCompatibleProvider, type OpenAiCompatibleProviderOptions } from "./openai-compatible.js";
export { createModelRouterFromEnvironment, type AiEnvironment } from "./config.js";
