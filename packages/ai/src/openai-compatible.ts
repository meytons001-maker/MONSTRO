import type { AiCapability, AiProvider, AiRequest, AiResponse } from "./index.js";

export interface OpenAiCompatibleProviderOptions {
  id: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  capabilities?: AiCapability[];
  timeoutMs?: number;
  fetch?: typeof fetch;
}

type ChatCompletionResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export class OpenAiCompatibleProvider implements AiProvider {
  readonly id: string;
  readonly capabilities: ReadonlySet<AiCapability>;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAiCompatibleProviderOptions) {
    if (!options.id.trim()) throw new Error("AI provider id must not be empty");
    if (!options.baseUrl.trim()) throw new Error("AI provider baseUrl must not be empty");
    if (!options.model.trim()) throw new Error("AI provider model must not be empty");
    this.id = options.id;
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetch ?? fetch;
    this.capabilities = new Set(options.capabilities ?? ["reasoning", "code"]);
  }

  async generate(request: AiRequest): Promise<AiResponse> {
    if (!this.capabilities.has(request.capability)) throw new Error(`AI provider ${this.id} does not support ${request.capability}`);
    const started = Date.now();
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    const messages = [];
    if (request.system?.trim()) messages.push({ role: "system", content: request.system });
    messages.push({ role: "user", content: request.prompt });

    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: this.model, messages }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`AI provider ${this.id} returned HTTP ${response.status}: ${raw.slice(0, 240)}`);

    let payload: ChatCompletionResponse;
    try { payload = JSON.parse(raw) as ChatCompletionResponse; }
    catch { throw new Error(`AI provider ${this.id} returned invalid JSON`); }
    const output = payload.choices?.[0]?.message?.content;
    if (typeof output !== "string" || !output.trim()) throw new Error(`AI provider ${this.id} returned no text output`);

    return {
      provider: this.id,
      model: payload.model || this.model,
      output,
      durationMs: Date.now() - started,
      usage: payload.usage ? { inputTokens: payload.usage.prompt_tokens, outputTokens: payload.usage.completion_tokens } : undefined,
    };
  }
}
