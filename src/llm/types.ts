// LLM 연결부 인터페이스. 나머지 코드는 어떤 연결 방식인지 모른다.

import type { ProviderId } from "../storage/settings";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CompleteRequest {
  system: string;
  messages: ChatTurn[];
  /** 응답 길이 상한 (토큰) */
  maxTokens?: number;
  /** 주면 응답을 이 JSON 스키마에 맞춰 달라고 한다(지원하는 연결 방식만). 응답은 그래도 문자열로 받는다 */
  jsonSchema?: Record<string, unknown>;
  /** 생각에 들일 노력. 계산이 필요한 채점만 medium (기본 low) */
  effort?: "low" | "medium";
}

export interface LlmProvider {
  id: ProviderId;
  /** 응답의 글자만 돌려준다 */
  complete(req: CompleteRequest): Promise<string>;
}

export type LlmErrorKind = "no-key" | "auth" | "rate" | "network" | "refusal" | "unavailable" | "other";

const MESSAGES: Record<LlmErrorKind, string> = {
  "no-key": "계정이 연결돼 있지 않습니다. 설정에서 연결해 주세요.",
  auth: "키가 맞지 않습니다. 설정에서 키를 다시 넣어 주세요.",
  rate: "요청이 너무 많거나 사용 한도에 닿았습니다. 잠시 뒤 다시 해 주세요.",
  network: "연결에 실패했습니다. 인터넷 연결을 확인해 주세요.",
  refusal: "이 요청에는 답을 받지 못했습니다. 표현을 바꿔 다시 해 주세요.",
  unavailable: "이 연결 방식은 아직 준비 중입니다.",
  other: "LLM 호출에 실패했습니다.",
};

export class LlmError extends Error {
  constructor(
    public kind: LlmErrorKind,
    detail?: string,
  ) {
    super(detail ? `${MESSAGES[kind]} (${detail})` : MESSAGES[kind]);
    this.name = "LlmError";
  }
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  available: boolean;
  needsKey: boolean;
  models: { id: string; label: string }[];
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "claude-api",
    label: "Claude API 키",
    available: true,
    needsKey: true,
    models: [
      { id: "claude-opus-5-5", label: "Claude Opus 5.5 (기본)" },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
    ],
  },
  { id: "openai-api", label: "OpenAI API 키", available: false, needsKey: true, models: [] },
  { id: "gemini-api", label: "Gemini API 키", available: false, needsKey: true, models: [] },
  { id: "claude-code", label: "Claude Code 경유 (내 PC)", available: false, needsKey: false, models: [] },
  { id: "chatgpt-login", label: "ChatGPT 로그인", available: false, needsKey: false, models: [] },
];

export function providerInfo(id: ProviderId): ProviderInfo {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]!;
}
