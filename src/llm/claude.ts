// Claude API 키 연결. 공식 SDK(@anthropic-ai/sdk)를 서비스 워커에서 쓴다.
// 키는 사용자가 넣은 것이고 chrome.storage.local에만 있다. 이 파일은 키를 저장하지 않는다.

import Anthropic from "@anthropic-ai/sdk";
import { LlmError, type CompleteRequest, type LlmProvider } from "./types";

/** 서버 쪽 대체 모델(refusal fallback)을 받는 모델 */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-2"]);

export interface ClaudeOptions {
  apiKey: string;
  model: string;
  /** 테스트에서 가짜 fetch를 넣는다 */
  fetch?: typeof fetch;
}

export function createClaudeProvider({ apiKey, model, fetch: fetchImpl }: ClaudeOptions): LlmProvider {
  const client = new Anthropic({
    apiKey,
    // 사용자가 자기 키를 자기 브라우저 확장에 넣어 쓰는 구조라 브라우저 호출을 허용한다.
    dangerouslyAllowBrowser: true,
    maxRetries: 2,
    timeout: 60_000,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });

  return {
    id: "claude-api",
    async complete(req: CompleteRequest): Promise<string> {
      let res: Anthropic.Beta.Messages.BetaMessage;
      try {
        res = await client.beta.messages.create({
          model,
          max_tokens: req.maxTokens ?? 4000,
          system: req.system,
          messages: req.messages,
          // 좁은 일 하나씩만 시키므로 노력 수준은 낮게
          output_config: {
            effort: req.effort ?? "low",
            ...(req.jsonSchema ? { format: { type: "json_schema", schema: req.jsonSchema } } : {}),
          },
          ...(FALLBACK_MODELS.has(model)
            ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
            : {}),
        });
      } catch (e) {
        throw toLlmError(e);
      }
      if (res.stop_reason === "refusal") throw new LlmError("refusal", res.stop_details?.category ?? undefined);
      const text = res.content
        .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
      if (!text) throw new LlmError("other", res.stop_reason === "max_tokens" ? "응답이 길어 잘렸습니다" : "빈 응답");
      return text;
    },
  };
}

function toLlmError(e: unknown): LlmError {
  if (e instanceof LlmError) return e;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new LlmError("auth");
  if (e instanceof Anthropic.RateLimitError) return new LlmError("rate");
  if (e instanceof Anthropic.APIConnectionError) return new LlmError("network");
  if (e instanceof Anthropic.APIError) return new LlmError("other", `${e.status ?? ""} ${e.message}`.trim());
  return new LlmError("other", e instanceof Error ? e.message : String(e));
}
