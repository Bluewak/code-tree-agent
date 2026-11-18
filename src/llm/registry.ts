// 설정에 맞는 연결 방식을 만든다. 새 방식은 여기에만 추가한다.

import type { Settings } from "../storage/settings";
import { createClaudeProvider } from "./claude";
import { LlmError, providerInfo, type LlmProvider } from "./types";

export function createProvider(settings: Settings, key: string | null): LlmProvider {
  const info = providerInfo(settings.provider);
  if (!info.available) throw new LlmError("unavailable");
  if (info.needsKey && !key) throw new LlmError("no-key");
  switch (settings.provider) {
    case "claude-api":
      return createClaudeProvider({ apiKey: key!, model: settings.model });
    default:
      throw new LlmError("unavailable");
  }
}

/** 연결 확인: 아주 짧은 요청 하나를 보낸다 */
export async function testProvider(p: LlmProvider): Promise<string> {
  const text = await p.complete({
    system: "연결 확인용 요청이다. 다른 말 없이 '확인'이라고만 답한다.",
    messages: [{ role: "user", content: "연결 확인" }],
    maxTokens: 1000,
  });
  return text.slice(0, 40);
}
