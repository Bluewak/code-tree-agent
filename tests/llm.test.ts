import { createClaudeProvider } from "../src/llm/claude";
import { createProvider } from "../src/llm/registry";
import { LlmError } from "../src/llm/types";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/storage/settings";

type Captured = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

function fakeFetch(status: number, json: unknown, captured: Captured[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    captured.push({ url: String(input), headers, body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

const okMessage = (text: string, extra: Record<string, unknown> = {}) => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [{ type: "text", text }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 1, output_tokens: 1 },
  ...extra,
});

describe("Claude 연결 (가짜 fetch)", () => {
  it("키·모델·브라우저 허용 헤더·JSON 스키마를 담아 보내고 글자를 돌려준다", async () => {
    const cap: Captured[] = [];
    const p = createClaudeProvider({ apiKey: "sk-test", model: "claude-opus-5-5", fetch: fakeFetch(200, okMessage('{"pass":true}'), cap) });
    const out = await p.complete({
      system: "sys",
      messages: [{ role: "user", content: "hi" }],
      jsonSchema: { type: "object" },
    });
    expect(out).toBe('{"pass":true}');
    expect(cap).toHaveLength(1);
    const c = cap[0]!;
    expect(c.url).toContain("https://api.anthropic.com/v1/messages");
    // SDK 1.x는 키를 Authorization 헤더로 보낸다(이전 버전은 x-api-key)
    expect(c.headers["x-api-key"] ?? c.headers["authorization"]?.replace(/^Bearer /, "")).toBe("sk-test");
    expect(c.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(c.body.model).toBe("claude-opus-5-5");
    expect(c.body.system).toBe("sys");
    expect(c.body.output_config).toEqual({ effort: "low", format: { type: "json_schema", schema: { type: "object" } } });
    expect(c.body.fallbacks).toBe("default");
  });

  it("Haiku에는 서버 대체 모델 설정을 넣지 않는다", async () => {
    const cap: Captured[] = [];
    const p = createClaudeProvider({ apiKey: "k", model: "claude-haiku-5-5", fetch: fakeFetch(200, okMessage("확인"), cap) });
    await p.complete({ system: "s", messages: [{ role: "user", content: "x" }] });
    expect(cap[0]!.body.fallbacks).toBeUndefined();
  });

  it("401이면 auth 오류", async () => {
    const p = createClaudeProvider({
      apiKey: "bad",
      model: "claude-opus-5-5",
      fetch: fakeFetch(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, []),
    });
    await expect(p.complete({ system: "s", messages: [{ role: "user", content: "x" }] })).rejects.toMatchObject({ kind: "auth" });
  });

  it("refusal이면 refusal 오류", async () => {
    const p = createClaudeProvider({
      apiKey: "k",
      model: "claude-opus-5-5",
      fetch: fakeFetch(200, okMessage("", { content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" } }), []),
    });
    await expect(p.complete({ system: "s", messages: [{ role: "user", content: "x" }] })).rejects.toMatchObject({ kind: "refusal" });
  });
});

describe("연결 방식 고르기", () => {
  it("키가 없으면 no-key", () => {
    expect(() => createProvider(DEFAULT_SETTINGS, null)).toThrow(LlmError);
    try {
      createProvider(DEFAULT_SETTINGS, null);
    } catch (e) {
      expect((e as LlmError).kind).toBe("no-key");
    }
  });
  it("준비 중인 방식은 unavailable", () => {
    try {
      createProvider({ ...DEFAULT_SETTINGS, provider: "openai-api" }, "k");
      expect.unreachable();
    } catch (e) {
      expect((e as LlmError).kind).toBe("unavailable");
    }
  });
  it("키가 있으면 Claude 연결을 만든다", () => {
    expect(createProvider(DEFAULT_SETTINGS, "k").id).toBe("claude-api");
  });
});

describe("설정 정규화", () => {
  it("깨진 값은 기본값으로", () => {
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ side: "up", provider: "x", questionsEnabled: "yes" })).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ side: "left", handleHidden: true }).side).toBe("left");
  });
});
