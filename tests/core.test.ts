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
  previousAnswers,
  progressCount,
  skipQuestion,
} from "../src/core/session";
import {
  CODE_NUDGE,
  buildChatRequest,
  buildGradeRequest,
  buildHintRequest,
  filterHint,
  grade,
  hint,
  parseGrade,
  stripCode,
  type GradeResult,
} from "../src/core/tasks";
import { DISPLAY_ORDER, QUESTIONS, displayIndex, inDisplayOrder, joinFields, questionDef } from "../src/core/questions";
import { composeAnswer, countIsFilled } from "../src/ui/BeforeView";
import { isTouched } from "../src/storage/records";

const problem = { title: "두 개의 격자 비교하기", statement: "격자 두 개를 비교한다", tex: ["1 \\le n"] };
const base = () => newSession({ problemId: "p", title: "t", language: "python3" }, new Date(2026, 10, 18, 16, 8));
const PASS = (summary = "요약"): GradeResult => ({ verdict: "pass", summary, feedback: "", modelAnswer: "" });
const PARTIAL = (summary: string, feedback: string): GradeResult => ({ verdict: "partial", summary, feedback, modelAnswer: "" });
const RETRY = (feedback: string, modelAnswer = ""): GradeResult => ({ verdict: "retry", summary: "", feedback, modelAnswer });
const gradeIn = (q: number, extra: Partial<Parameters<typeof buildGradeRequest>[0]> = {}) => ({
  problem,
  q,
  answer: "답",
  previous: [],
  attempt: 1,
  language: null,
  ...extra,
});

describe("질문 정의와 화면 순서", () => {
  it("기록 배열은 q 1~6, 화면은 입력 → 출력 → 손풀이 → 규칙 → 구조 → 경계", () => {
    expect(QUESTIONS.map((d) => d.q)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(questionDef(3).short).toBe("규칙");
    expect(questionDef(4).short).toBe("손풀이");
    expect(DISPLAY_ORDER.map((q) => questionDef(q).short)).toEqual(["입력", "출력", "손풀이", "규칙", "구조", "경계"]);
    expect(displayIndex(4)).toBe(3);
    expect(displayIndex(3)).toBe(4);
    expect(inDisplayOrder(base().questions).map((p) => p.q)).toEqual([1, 2, 4, 3, 5, 6]);
  });
  it("칸마다 쓰는 틀, 예시(또는 작은 칸), 왜?가 있다", () => {
    for (const d of QUESTIONS) {
      expect(d.guide.length, d.short).toBeGreaterThan(5);
      expect(d.why.length, d.short).toBeGreaterThan(5);
      expect(!!d.example || !!d.fields, d.short).toBe(true);
    }
    expect(questionDef(5).fields!.map((f) => f.label)).toEqual(["횟수", "줄이기", "준비", "반복", "출력"]);
    expect(questionDef(6).fields!.map((f) => f.label)).toEqual(["입력", "함정", "정답"]);
  });
  it("손풀이는 '실제 숫자로', 규칙은 '숫자 없이' (옆 칸과 갈라 주는 말)", () => {
    expect(questionDef(4).text).toContain("실제 숫자로");
    expect(questionDef(3).text).toContain("숫자 없이");
  });
});

describe("작은 칸 답 모으기", () => {
  it("구조: 횟수가 비었거나 됨/안 됨을 안 골랐으면 보낼 수 없다", () => {
    const d = questionDef(5);
    expect(composeAnswer(d, { "5:loop": "줄마다" })).toBeNull();
    expect(composeAnswer(d, { "5:count": "ㅇ", "5:verdict": "됨", "5:loop": "x" })).toBeNull(); // 숫자·이름 없음
    expect(countIsFilled("n×n")).toBe(true);
    expect(composeAnswer(d, { "5:count": "100번", "5:loop": "x" })).toBeNull(); // 판정 없음
  });
  it("구조: '됨'이면 줄이기 칸은 보내지 않는다", () => {
    const d = questionDef(5);
    const out = composeAnswer(d, { "5:count": "100번", "5:verdict": "됨", "5:reduce": "무시", "5:prep": "없음", "5:loop": "줄마다", "5:out": "끝나고" });
    expect(out).toBe("횟수: 100번 → 됨\n준비: 없음\n반복: 줄마다\n출력: 끝나고");
    const slow = composeAnswer(d, { "5:count": "n×n", "5:verdict": "안 됨", "5:reduce": "정렬", "5:loop": "양 끝" });
    expect(slow).toContain("줄이기: 정렬");
  });
  it("경계: 입력과 정답이 있어야 보낸다", () => {
    const d = questionDef(6);
    expect(composeAnswer(d, { "6:input": "5 5" })).toBeNull();
    expect(composeAnswer(d, { "6:input": "5 5", "6:trap": "같을 때", "6:answer": "5 / 1" })).toBe("입력: 5 5\n함정: 같을 때\n정답: 5 / 1");
  });
  it("큰 칸: 비어 있으면 보낼 수 없다", () => {
    expect(composeAnswer(questionDef(1), { "1": "  " })).toBeNull();
    expect(composeAnswer(questionDef(1), { "1": "n" })).toBe("n");
  });
  it("joinFields는 횟수 칸이 비면 (없음)으로", () => {
    expect(joinFields(questionDef(5), {}, {})).toBe("횟수: (없음)");
  });
});

describe("채점 요청과 응답", () => {
  it("칸 하나만 묻고, 판정 3단계와 JSON 스키마를 붙인다", () => {
    const req = buildGradeRequest(gradeIn(2, { answer: "한 줄에 하나", previous: [{ q: 1, text: "n과 격자 둘", revealed: false }] }));
    expect(req.system).toContain('"출력" 칸');
    expect(req.system).toContain("partial: 보완 통과");
    expect(req.system).toContain("애매하면 통과 쪽으로");
    expect(req.jsonSchema).toBeDefined();
    expect(req.messages[0]!.content).toContain("<student_answer>\n한 줄에 하나\n</student_answer>");
    expect(req.messages[0]!.content).toContain("- 입력: n과 격자 둘");
  });
  it("공개된 앞 답은 학생 답과 구분해서 보낸다", () => {
    const req = buildGradeRequest(gradeIn(3, { previous: [{ q: 4, text: "모범 답", revealed: true }] }));
    expect(req.messages[0]!.content).toContain("(학생이 못 풀어 공개한 답) 모범 답");
  });
  it("계산이 필요한 칸(손풀이·규칙·구조·경계)은 노력 수준을 올린다", () => {
    expect(buildGradeRequest(gradeIn(1)).effort).toBe("low");
    expect(buildGradeRequest(gradeIn(4)).effort).toBe("medium");
    expect(buildGradeRequest(gradeIn(5)).effort).toBe("medium");
  });
  it("세 번째 시도면 모범 답을 요청한다", () => {
    expect(buildGradeRequest(gradeIn(4, { attempt: 2 })).system).toContain("modelAnswer는 빈 글자");
    const last = buildGradeRequest(gradeIn(4, { attempt: 3 }));
    expect(last.system).toContain("마지막 시도");
    expect(last.messages[0]!.content).toContain("3번째 (마지막)");
  });
  it("입력·출력·경계는 두 번째부터 바로 정정해도 된다", () => {
    expect(buildGradeRequest(gradeIn(2, { attempt: 2 })).system).toContain("바로 정정해도 된다");
    expect(buildGradeRequest(gradeIn(3, { attempt: 2 })).system).not.toContain("바로 정정해도 된다");
  });
  it("파이썬이면 파이썬 사실을 덧붙인다", () => {
    expect(buildGradeRequest(gradeIn(5, { language: "python3" })).system).toContain("학생은 파이썬으로 푼다");
    expect(buildGradeRequest(gradeIn(5, { language: "cpp" })).system).not.toContain("학생은 파이썬으로 푼다");
    expect(buildHintRequest({ problem, q: 2, level: 1, answer: null, code: null, given: [], language: "python" }).system).toContain("대괄호와 쉼표");
    expect(buildChatRequest({ problem, history: [], message: "?", code: null, language: "python3" }).system).toContain("sys.stdin.readline");
  });
  it("판정 JSON을 읽는다 (코드 울타리·앞뒤 말 허용)", () => {
    expect(parseGrade('{"verdict":"pass","summary":"n, m과 두 격자","feedback":"","modelAnswer":""}')).toEqual(PASS("n, m과 두 격자"));
    expect(parseGrade('결과:\n```json\n{"verdict":"partial","summary":"a","feedback":"하나만 더:\\n범위","modelAnswer":"x"}\n```')).toEqual(
      PARTIAL("a", "하나만 더: 범위"),
    );
    expect(parseGrade('{"verdict":"retry","summary":"","feedback":"몇 줄?","modelAnswer":"n줄"}')).toEqual(RETRY("몇 줄?", "n줄"));
  });
  it("통과면 feedback을 비우고, 다시면 빈 피드백을 채운다", () => {
    expect(parseGrade('{"verdict":"pass","summary":"","feedback":"덧말","modelAnswer":""}')).toEqual(PASS("통과"));
    expect(parseGrade('{"verdict":"retry","summary":"","feedback":"","modelAnswer":""}').feedback).toBe("조금 더 생각해 볼까요?");
  });
  it("예전 모양 {pass, feedback}도 읽는다", () => {
    expect(parseGrade('{"pass":true,"feedback":"요약"}')).toEqual(PASS("요약"));
    expect(parseGrade('{"pass":false,"feedback":"몇 개?"}')).toEqual(RETRY("몇 개?"));
  });
  it("모양이 다르면 오류", () => {
    expect(() => parseGrade("모르겠어요")).toThrow(LlmError);
    expect(() => parseGrade('{"verdict":"maybe"}')).toThrow(LlmError);
  });
  it("가짜 연결로 채점한다", async () => {
    const p = createFakeProvider(() => '{"verdict":"retry","summary":"","feedback":"출력은 몇 줄인가요?","modelAnswer":""}');
    expect(await grade(p, gradeIn(2))).toEqual(RETRY("출력은 몇 줄인가요?"));
    expect(p.calls).toHaveLength(1);
  });
});

describe("힌트 거르기", () => {
  it("1~2단계에서 코드 블록을 지운다", () => {
    const t = "행마다 비교해 보세요.\n```python\nfor i in range(n):\n    print(i)\n```";
    expect(filterHint(t, 1)).toBe("행마다 비교해 보세요.");
    expect(filterHint(t, 2)).toBe("행마다 비교해 보세요.");
  });
  it("1단계는 한 문장, 2단계는 두 줄까지 (목록 기호 제거)", () => {
    const long = "N이 가장 작을 때(1)와 가장 클 때(10)는 출력이 어떻게 나와야 할까요? 지금 코드로 직접 따라가 보면 숫자가 제대로 나오나요?";
    expect(filterHint(long, 1)).toBe("N이 가장 작을 때(1)와 가장 클 때(10)는 출력이 어떻게 나와야 할까요?");
    const bullets = "방향을 바꿔 보세요.\n\n- 각 줄 끝에 공백이 남아도 괜찮은지\n- 숫자 사이 간격은 한 칸인지\n\nN=1일 때도 따라가 보세요.";
    expect(filterHint(bullets, 2)).toBe("방향을 바꿔 보세요. 각 줄 끝에 공백이 남아도 괜찮은지");
    expect(filterHint("가".repeat(300), 1).length).toBeLessThanOrEqual(140);
  });
  it("칸 힌트는 그 칸 주제 안에서만, 코드 이야기를 하지 않게 지시한다", () => {
    const sys = buildHintRequest({ problem, q: 6, level: 2, answer: null, code: null, given: [] }).system;
    expect(sys).toContain("다른 칸의 주제");
    expect(sys).toContain("코드 이야기는 하지 않는다");
  });
  it("3단계는 코드 한 줄을 남긴다", () => {
    expect(filterHint("```python\nprint(*row)\n```", 3)).toContain("print(*row)");
  });
  it("다 지워지면 빈 글자, hint()는 오류를 낸다", async () => {
    expect(filterHint("```\nx=1\n```", 1)).toBe("");
    const p = createFakeProvider(() => "```\nx=1\n```");
    await expect(hint(p, { problem, q: 1, level: 1, answer: null, code: null, given: [] })).rejects.toThrow(LlmError);
  });
  it("칸 힌트 요청에 그 칸의 힌트 안내가 들어간다", async () => {
    const p = createFakeProvider(() => "같은 위치는 어떻게 찾을까요?\n```py\nfor i in range(n): pass\n```");
    const out = await hint(p, { problem, q: 4, level: 1, answer: null, code: null, given: [] });
    expect(out).toBe("같은 위치는 어떻게 찾을까요?");
    expect(p.calls[0]!.system).toContain("힌트 1단계");
    expect(p.calls[0]!.system).toContain(questionDef(4).hintGuide);
  });
  it("stripCode는 코드 같은 줄을 지운다", () => {
    expect(stripCode("이렇게 해 보세요\nfor i in range(n):\n끝")).toBe("이렇게 해 보세요\n끝");
  });
});

describe("진행 상태", () => {
  it("시작은 입력, 0/6, 모두 not_reached", () => {
    const s = base();
    expect(currentQ(s)).toBe(1);
    expect(progressCount(s)).toBe(0);
    expect(s.questions.every((q) => q.state === "not_reached")).toBe(true);
    expect(s.startedAt.startsWith("2026-11-18T16:08:00")).toBe(true);
  });
  it("화면 순서대로 진행: 출력 다음은 손풀이(q4), 그다음 규칙(q3)", () => {
    let s = applyGrade(base(), 1, "a", PASS());
    s = applyGrade(s, 2, "b", PASS());
    expect(currentQ(s)).toBe(4);
    s = applyGrade(s, 4, "c", PASS());
    expect(currentQ(s)).toBe(3);
    s = applyGrade(s, 3, "d", PASS());
    expect(currentQ(s)).toBe(5);
  });
  it("앞 답 문맥은 화면 순서 기준 (규칙 채점에 손풀이 답이 들어간다)", () => {
    let s = applyGrade(base(), 1, "a", PASS("입력 요약"));
    s = applyGrade(s, 2, "b", PASS("출력 요약"));
    s = applyGrade(s, 4, "c", PASS("손풀이 요약"));
    expect(previousAnswers(s, 3).map((p) => p.text)).toEqual(["입력 요약", "출력 요약", "손풀이 요약"]);
    expect(previousAnswers(s, 4).map((p) => p.text)).toEqual(["입력 요약", "출력 요약"]);
  });
  it("통과하면 접히고, 보완 통과는 passed + 덧붙임 한 줄", () => {
    let s = applyGrade(base(), 1, "n, m", PASS("n, m과 두 격자"));
    expect(s.questions[0]).toMatchObject({ state: "passed", resolved: true, summary: "n, m과 두 격자", feedback: null });
    s = applyGrade(s, 2, "x", PARTIAL("n줄", "하나만 더: 구분자"));
    expect(s.questions[1]).toMatchObject({ state: "passed", resolved: true, summary: "n줄", feedback: "하나만 더: 구분자" });
  });
  it("다시면 그 자리, 나중에 통과해도 기록은 failed", () => {
    let s = applyGrade(base(), 1, "x", RETRY("몇 개가 들어오나요?"));
    expect(s.questions[0]).toMatchObject({ state: "failed", resolved: false, feedback: "몇 개가 들어오나요?", attempts: 1 });
    expect(currentQ(s)).toBe(1);
    s = applyGrade(s, 1, "n, m", PASS("ok"));
    expect(s.questions[0]).toMatchObject({ state: "failed", resolved: true, attempts: 2 });
    expect(currentQ(s)).toBe(2);
  });
  it("세 번째 다시면 답을 보여 주고 넘어간다 (failed)", () => {
    let s = applyGrade(base(), 1, "x", RETRY("1"));
    s = applyGrade(s, 1, "y", RETRY("2"));
    expect(currentQ(s)).toBe(1);
    s = applyGrade(s, 1, "z", RETRY("3", "1줄 n: 정수 1개"));
    expect(s.questions[0]).toMatchObject({ state: "failed", resolved: true, revealed: "1줄 n: 정수 1개", attempts: 3 });
    expect(currentQ(s)).toBe(2);
    expect(previousAnswers(s, 2)).toEqual([{ q: 1, text: "1줄 n: 정수 1개", revealed: true }]);
  });
  it("모범 답이 비어도 세 번째에는 넘어간다", () => {
    let s = base();
    for (let i = 0; i < 3; i++) s = applyGrade(s, 1, "x", RETRY("?"));
    expect(s.questions[0]!.resolved).toBe(true);
    expect(s.questions[0]!.revealed).toBeTruthy();
  });
  it("건너뛰면 skipped, 틀린 뒤 건너뛰면 failed", () => {
    let s = skipQuestion(base(), 1);
    expect(s.questions[0]!.state).toBe("skipped");
    s = applyGrade(s, 2, "x", RETRY("?"));
    s = skipQuestion(s, 2);
    expect(s.questions[1]!.state).toBe("failed");
    expect(currentQ(s)).toBe(4);
  });
  it("6칸까지 진행하면 currentQ는 null, 6/6", () => {
    let s = base();
    for (const q of DISPLAY_ORDER) s = q % 2 ? applyGrade(s, q, "a", PASS()) : skipQuestion(s, q);
    expect(currentQ(s)).toBeNull();
    expect(progressCount(s)).toBe(6);
  });
  it("칸 힌트는 1단계 → 2단계 → 끝, 문제 전체 힌트 단계(hints)에는 넣지 않는다", () => {
    let s = base();
    expect(nextQuestionHintLevel(s, 1)).toBe(1);
    s = addHint(s, 1, "h1");
    expect(nextQuestionHintLevel(s, 1)).toBe(2);
    s = addHint(s, 1, "h2");
    expect(nextQuestionHintLevel(s, 1)).toBeNull();
    expect(s.hints).toEqual({ maxLevel: 0, answerRevealed: false });
    expect(s.questions[0]!.hints).toEqual(["h1", "h2"]);
  });
  it("칸 힌트만 받아도 손댄 풀이로 본다 (자동 저장)", () => {
    expect(isTouched(base())).toBe(false);
    expect(isTouched(addHint(base(), 1, "h"))).toBe(true);
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
