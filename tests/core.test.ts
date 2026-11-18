import { createFakeProvider } from "../src/llm/fake";
import { LlmError } from "../src/llm/types";
import {
  addChat,
  addHint,
  applyGrade,
  checkFreeAsk,
  currentQ,
  localIso,
  newSession,
  nextQuestionHintLevel,
  progressCount,
  skipQuestion,
} from "../src/core/session";
import { CODE_NUDGE, buildGradeRequest, filterHint, grade, hint, parseGrade, stripCode } from "../src/core/tasks";

const problem = { title: "두 개의 격자 비교하기", statement: "격자 두 개를 비교한다", tex: ["1 \\le n"] };
const base = () => newSession({ problemId: "p", title: "t", language: "python" }, new Date(2026, 10, 18, 16, 8));

describe("채점 요청과 응답", () => {
  it("N번 질문만 묻고 JSON 스키마를 붙인다", () => {
    const req = buildGradeRequest({ problem, q: 2, answer: "한 줄에 하나", previous: [{ q: 1, summary: "n과 격자 둘" }] });
    expect(req.system).toContain('2번 질문 "무엇을 어떤 형식으로 출력하는가"');
    expect(req.jsonSchema).toBeDefined();
    expect(req.messages[0]!.content).toContain("<student_answer>\n한 줄에 하나\n</student_answer>");
    expect(req.messages[0]!.content).toContain("1. 입력: n과 격자 둘");
  });
  it("JSON을 읽는다 (코드 울타리·앞뒤 말 허용)", () => {
    expect(parseGrade('{"pass":true,"feedback":"n, m과 두 격자"}')).toEqual({ pass: true, feedback: "n, m과 두 격자" });
    expect(parseGrade('결과:\n```json\n{"pass": false, "feedback": "몇 줄을\\n찍나요?"}\n```')).toEqual({
      pass: false,
      feedback: "몇 줄을 찍나요?",
    });
  });
  it("모양이 다르면 오류", () => {
    expect(() => parseGrade("모르겠어요")).toThrow(LlmError);
    expect(() => parseGrade('{"pass":"yes","feedback":1}')).toThrow(LlmError);
  });
  it("가짜 연결로 채점한다", async () => {
    const p = createFakeProvider(() => '{"pass":false,"feedback":"출력은 몇 줄인가요?"}');
    expect(await grade(p, { problem, q: 2, answer: "x", previous: [] })).toEqual({ pass: false, feedback: "출력은 몇 줄인가요?" });
    expect(p.calls).toHaveLength(1);
  });
});

describe("힌트 거르기", () => {
  it("1~2단계에서 코드 블록을 지운다", () => {
    const t = "행마다 비교해 보세요.\n```python\nfor i in range(n):\n    print(i)\n```";
    expect(filterHint(t, 1)).toBe("행마다 비교해 보세요.");
    expect(filterHint(t, 2)).toBe("행마다 비교해 보세요.");
  });
  it("3단계는 코드 한 줄을 남긴다", () => {
    expect(filterHint("```python\nprint(*row)\n```", 3)).toContain("print(*row)");
  });
  it("다 지워지면 빈 글자, hint()는 오류를 낸다", async () => {
    expect(filterHint("```\nx=1\n```", 1)).toBe("");
    const p = createFakeProvider(() => "```\nx=1\n```");
    await expect(hint(p, { problem, q: 1, level: 1, answer: null, code: null, given: [] })).rejects.toThrow(LlmError);
  });
  it("가짜 연결로 1단계 힌트를 받는다", async () => {
    const p = createFakeProvider(() => "같은 위치는 어떻게 찾을까요?\n```py\nfor i in range(n): pass\n```");
    const out = await hint(p, { problem, q: 5, level: 1, answer: null, code: null, given: [] });
    expect(out).toBe("같은 위치는 어떻게 찾을까요?");
    expect(p.calls[0]!.system).toContain("힌트 1단계");
  });
  it("stripCode는 코드 같은 줄을 지운다", () => {
    expect(stripCode("이렇게 해 보세요\nfor i in range(n):\n끝")).toBe("이렇게 해 보세요\n끝");
  });
});

describe("진행 상태", () => {
  it("시작은 1번, 0/6, 모두 not_reached", () => {
    const s = base();
    expect(currentQ(s)).toBe(1);
    expect(progressCount(s)).toBe(0);
    expect(s.questions.every((q) => q.state === "not_reached")).toBe(true);
    expect(s.startedAt.startsWith("2026-11-18T16:08:00")).toBe(true);
  });
  it("통과하면 접히고 다음으로", () => {
    const s = applyGrade(base(), 1, "n, m", { pass: true, feedback: "n, m과 두 격자" });
    expect(s.questions[0]).toMatchObject({ state: "passed", resolved: true, summary: "n, m과 두 격자" });
    expect(currentQ(s)).toBe(2);
    expect(progressCount(s)).toBe(1);
  });
  it("틀리면 되묻고 그 자리. 나중에 통과해도 기록은 failed", () => {
    let s = applyGrade(base(), 1, "x", { pass: false, feedback: "몇 개가 들어오나요?" });
    expect(s.questions[0]).toMatchObject({ state: "failed", resolved: false, feedback: "몇 개가 들어오나요?" });
    expect(currentQ(s)).toBe(1);
    s = applyGrade(s, 1, "n, m", { pass: true, feedback: "ok" });
    expect(s.questions[0]).toMatchObject({ state: "failed", resolved: true, attempts: 2 });
    expect(currentQ(s)).toBe(2);
  });
  it("건너뛰면 skipped, 틀린 뒤 건너뛰면 failed", () => {
    let s = skipQuestion(base(), 1);
    expect(s.questions[0]!.state).toBe("skipped");
    s = applyGrade(s, 2, "x", { pass: false, feedback: "?" });
    s = skipQuestion(s, 2);
    expect(s.questions[1]!.state).toBe("failed");
    expect(currentQ(s)).toBe(3);
  });
  it("6번까지 진행하면 currentQ는 null, 6/6", () => {
    let s = base();
    for (let q = 1; q <= 6; q++) s = q % 2 ? applyGrade(s, q, "a", { pass: true, feedback: "a" }) : skipQuestion(s, q);
    expect(currentQ(s)).toBeNull();
    expect(progressCount(s)).toBe(6);
  });
  it("질문 힌트는 1단계 → 2단계 → 끝, maxLevel 기록", () => {
    let s = base();
    expect(nextQuestionHintLevel(s, 1)).toBe(1);
    s = addHint(s, 1, "h1", 1);
    expect(nextQuestionHintLevel(s, 1)).toBe(2);
    s = addHint(s, 1, "h2", 2);
    expect(nextQuestionHintLevel(s, 1)).toBeNull();
    expect(s.hints).toEqual({ maxLevel: 2, answerRevealed: false });
    s = addHint(s, null, "정답", 4);
    expect(s.hints).toEqual({ maxLevel: 3, answerRevealed: true });
  });
});

describe("자유 질문 5번 제한", () => {
  it("5번 이어지면 6번째는 LLM 없이 코드로 넘긴다", () => {
    let s = base();
    for (let i = 0; i < 5; i++) {
      const c = checkFreeAsk(s, "code");
      expect(c.ok).toBe(true);
      s = addChat(c.session, `q${i}`, `a${i}`);
    }
    const c = checkFreeAsk(s, "code");
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.nudge).toBe(CODE_NUDGE);
  });
  it("질문에 답하거나 코드를 고치면 다시 물을 수 있다", () => {
    let s = base();
    for (let i = 0; i < 5; i++) s = addChat(s, "q", "a");
    const blocked = checkFreeAsk(s, "code v1");
    expect(blocked.ok).toBe(false);
    s = blocked.session;
    expect(checkFreeAsk(s, "code v1").ok).toBe(false);
    expect(checkFreeAsk(s, "code v2").ok).toBe(true);
    expect(checkFreeAsk(skipQuestion(s, 1), "code v1").ok).toBe(true);
  });
});

describe("localIso", () => {
  it("현지 시간과 오프셋", () => {
    expect(localIso(new Date(2026, 0, 2, 3, 4, 5))).toMatch(/^2026-01-02T03:04:05[+-]\d\d:\d\d$/);
  });
});

describe("채점 응답 안의 코드 블록", () => {
  it("feedback 안의 ``` 코드 블록은 지운다 (울타리만 지우고 코드가 남던 버그)", () => {
    const text = JSON.stringify({ pass: false, feedback: "몇 줄을 찍나요?\n```python\nprint(*row)\n```" });
    expect(parseGrade("```json\n" + text + "\n```")).toEqual({ pass: false, feedback: "몇 줄을 찍나요?" });
  });
});
