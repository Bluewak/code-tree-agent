import { validateAttempt, validateConcept, type AttemptRecord } from "../src/storage/schema";
import { computeStats, isTouched, nextStartTime, recordsToMarkdown, sessionToRecord } from "../src/storage/records";
import { addChat, addHint, applyGrade, newSession, skipQuestion } from "../src/core/session";
import { detectDifficulty } from "../src/sites/codetree/parse";

// 지시서 6번의 예시 그대로
const BRIEF_ATTEMPT: AttemptRecord = {
  schemaVersion: 1,
  id: "codetree:intro-compare-two-grids:2026-11-18T16:08",
  site: "codetree",
  problemId: "intro-compare-two-grids",
  title: "두 개의 격자 비교하기",
  difficulty: "Easy",
  language: "python",
  startedAt: "2026-11-18T16:08:00+09:00",
  finishedAt: "2026-11-18T16:20:00+09:00",
  result: "passed",
  questions: [
    { q: 1, state: "passed" },
    { q: 2, state: "failed" },
    { q: 3, state: "passed" },
    { q: 4, state: "skipped" },
    { q: 5, state: "failed" },
    { q: 6, state: "skipped" },
  ],
  runs: { total: 3, errors: 0, mismatches: 1 },
  hints: { maxLevel: 2, answerRevealed: false },
  gaps: [{ text: "print(리스트)는 대괄호와 쉼표까지 찍는다", q: 2, tag: "출력" }],
  concepts: ["print-unpack", "zip"],
  reviewAt: "2026-11-20",
};

const BRIEF_CONCEPT = {
  schemaVersion: 1,
  id: "zip",
  name: "zip(a, b)",
  rule: "같은 번째끼리 짝지어 하나씩 건네준다",
  state: "explained",
  firstSeenAt: "2026-11-18",
  typedAt: null,
  seenIn: ["codetree:intro-compare-two-grids:2026-11-18T16:08"],
};

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const errorsOf = (x: unknown) => {
  const v = validateAttempt(x);
  return v.ok ? [] : v.errors;
};

describe("풀이 기록 검증", () => {
  it("지시서 예시는 통과", () => {
    expect(validateAttempt(BRIEF_ATTEMPT)).toEqual({ ok: true });
  });
  it("null 허용 필드가 모두 null이어도 통과 (진행 중)", () => {
    const r = { ...clone(BRIEF_ATTEMPT), difficulty: null, language: null, finishedAt: null, result: null, reviewAt: null, gaps: [{ text: "x", q: null, tag: null }] };
    expect(validateAttempt(r)).toEqual({ ok: true });
  });
  it("필드를 빼면 실패", () => {
    for (const k of Object.keys(BRIEF_ATTEMPT)) {
      const r = clone(BRIEF_ATTEMPT) as unknown as Record<string, unknown>;
      delete r[k];
      expect(errorsOf(r).some((e) => e.startsWith(`${k}: 필드가 없음`)), k).toBe(true);
    }
  });
  it("값이 없으면 빼지 말고 null: undefined는 실패", () => {
    const r = clone(BRIEF_ATTEMPT) as unknown as Record<string, unknown>;
    r.difficulty = undefined;
    expect(validateAttempt(JSON.parse(JSON.stringify(r))).ok).toBe(false);
  });
  it("정해지지 않은 필드가 있으면 실패 (통계 등을 저장하지 않는다)", () => {
    expect(errorsOf({ ...clone(BRIEF_ATTEMPT), passRate: 0.5 })).toContain("passRate: 정해지지 않은 필드");
    const r = clone(BRIEF_ATTEMPT) as unknown as { questions: Record<string, unknown>[] };
    r.questions[0]!.answer = "x";
    expect(validateAttempt(r).ok).toBe(false);
  });
  it("questions는 항상 6칸, 1~6 순서", () => {
    const r = clone(BRIEF_ATTEMPT);
    r.questions.pop();
    expect(errorsOf(r)).toContain("questions: 항상 6칸");
    const r2 = clone(BRIEF_ATTEMPT);
    [r2.questions[0], r2.questions[1]] = [r2.questions[1]!, r2.questions[0]!];
    expect(validateAttempt(r2).ok).toBe(false);
  });
  it("열거값 밖이면 실패", () => {
    const bad: [string, (r: AttemptRecord) => void][] = [
      ["state", (r) => ((r.questions[0] as { state: string }).state = "done")],
      ["result", (r) => ((r as { result: string }).result = "failed")],
      ["maxLevel 4", (r) => ((r.hints as { maxLevel: number }).maxLevel = 4)],
      ["tag", (r) => ((r.gaps[0] as { tag: string }).tag = "문법")],
      ["gap q 7", (r) => ((r.gaps[0] as { q: number }).q = 7)],
      ["site", (r) => ((r as { site: string }).site = "boj")],
      ["schemaVersion", (r) => ((r as { schemaVersion: number }).schemaVersion = 2)],
    ];
    for (const [name, mutate] of bad) {
      const r = clone(BRIEF_ATTEMPT);
      mutate(r);
      expect(validateAttempt(r).ok, name).toBe(false);
    }
  });
  it("id는 site:problemId:startedAt 앞 16자", () => {
    expect(validateAttempt({ ...clone(BRIEF_ATTEMPT), id: "codetree:intro-compare-two-grids:2026-11-18T16:09" }).ok).toBe(false);
  });
  it("날짜 형식", () => {
    expect(validateAttempt({ ...clone(BRIEF_ATTEMPT), startedAt: "2026-11-18 16:08", id: "codetree:intro-compare-two-grids:2026-11-18 16:08" }).ok).toBe(false);
    expect(validateAttempt({ ...clone(BRIEF_ATTEMPT), reviewAt: "11/20" }).ok).toBe(false);
  });
  it("끝난 풀이는 finishedAt이 있어야 함, runs 합은 total 이하", () => {
    expect(validateAttempt({ ...clone(BRIEF_ATTEMPT), finishedAt: null }).ok).toBe(false);
    expect(validateAttempt({ ...clone(BRIEF_ATTEMPT), runs: { total: 1, errors: 1, mismatches: 1 } }).ok).toBe(false);
  });
  it("concepts는 중복 없는 id 목록", () => {
    expect(validateAttempt({ ...clone(BRIEF_ATTEMPT), concepts: ["zip", "zip"] }).ok).toBe(false);
    expect(validateAttempt({ ...clone(BRIEF_ATTEMPT), concepts: ["Zip 함수"] }).ok).toBe(false);
  });
});

describe("개념 기록 검증", () => {
  it("지시서 예시는 통과", () => {
    expect(validateConcept(BRIEF_CONCEPT)).toEqual({ ok: true });
  });
  it("typed면 typedAt이 있어야 하고, explained면 null", () => {
    expect(validateConcept({ ...BRIEF_CONCEPT, state: "typed", typedAt: "2026-11-19" }).ok).toBe(true);
    expect(validateConcept({ ...BRIEF_CONCEPT, state: "typed" }).ok).toBe(false);
    expect(validateConcept({ ...BRIEF_CONCEPT, typedAt: "2026-11-19" }).ok).toBe(false);
  });
  it("필드를 빼거나 더하면 실패, rule은 null 허용", () => {
    const { rule: _r, ...noRule } = BRIEF_CONCEPT;
    expect(validateConcept(noRule).ok).toBe(false);
    expect(validateConcept({ ...BRIEF_CONCEPT, rule: null }).ok).toBe(true);
    expect(validateConcept({ ...BRIEF_CONCEPT, extra: 1 }).ok).toBe(false);
  });
});

describe("진행 상태 → 풀이 기록", () => {
  const start = new Date(2026, 10, 18, 16, 8);
  const fresh = () => newSession({ problemId: "intro-compare-two-grids", title: "두 개의 격자 비교하기", language: "python3" }, start);

  it("막 시작한 풀이도 스키마를 통과, 6칸 not_reached", () => {
    const r = sessionToRecord(fresh());
    expect(validateAttempt(r)).toEqual({ ok: true });
    expect(r.questions.map((q) => q.state)).toEqual(Array(6).fill("not_reached"));
    expect(r.id).toBe(`codetree:intro-compare-two-grids:${r.startedAt.slice(0, 16)}`);
    expect(r.id.endsWith("2026-11-18T16:08")).toBe(true);
  });
  it("진행한 풀이: 상태가 옮겨지고, 배열은 q 1~6 순서, 칸 힌트는 hints에 안 들어간다", () => {
    let s = fresh();
    s = applyGrade(s, 1, "a", { verdict: "pass", summary: "a", feedback: "", modelAnswer: "" });
    s = applyGrade(s, 2, "b", { verdict: "retry", summary: "", feedback: "?", modelAnswer: "" });
    s = addHint(s, 2, "h");
    s = skipQuestion(s, 2);
    s = skipQuestion(s, 4); // 화면에서 세 번째(손풀이)
    s = applyGrade(s, 3, "c", { verdict: "partial", summary: "c", feedback: "하나만 더", modelAnswer: "" });
    const r = sessionToRecord(s, "Easy");
    expect(validateAttempt(r)).toEqual({ ok: true });
    expect(r.questions.map((q) => q.q)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.questions.map((q) => q.state)).toEqual(["passed", "failed", "passed", "skipped", "not_reached", "not_reached"]);
    expect(r.hints).toEqual({ maxLevel: 0, answerRevealed: false });
    expect(r.difficulty).toBe("Easy");
  });
  it("끝낸 풀이", () => {
    const s = { ...fresh(), result: "gave_up" as const, finishedAt: "2026-11-18T16:30:00+09:00" };
    expect(validateAttempt(sessionToRecord(s))).toEqual({ ok: true });
  });
  it("제목이 없으면 problemId를 제목으로", () => {
    const s = newSession({ problemId: "p-1", title: null, language: null }, start);
    expect(sessionToRecord(s).title).toBe("p-1");
  });
  it("손댄 풀이만 기록 대상", () => {
    expect(isTouched(fresh())).toBe(false);
    expect(isTouched(skipQuestion(fresh(), 1))).toBe(true);
    expect(isTouched(addChat(fresh(), "q", "a"))).toBe(true);
  });
});

describe("통계와 글", () => {
  const second = { ...clone(BRIEF_ATTEMPT), id: "codetree:other:2026-11-19T10:00", problemId: "other", title: "다른 문제", startedAt: "2026-11-19T10:00:00+09:00", result: null, finishedAt: null, gaps: [], concepts: [], reviewAt: null };
  it("통계는 매번 계산", () => {
    const st = computeStats([BRIEF_ATTEMPT, second as AttemptRecord]);
    expect(st).toMatchObject({ attempts: 2, problems: 2, passed: 1, gaveUp: 0, ongoing: 1 });
    expect(st.failedByQ).toEqual([0, 2, 0, 0, 2, 0]);
  });
  it("글로 복사하기: 제목, 결과, 질문, 몰랐던 것, 개념이 들어간다", () => {
    const md = recordsToMarkdown([BRIEF_ATTEMPT], new Date(2026, 10, 18));
    expect(md).toContain("# 내 기록 (2026-11-18)");
    expect(md).toContain("## 두 개의 격자 비교하기 (2026-11-18 16:08)");
    expect(md).toContain("- 결과: 통과 (2026-11-18 16:20)");
    expect(md).toContain("입력 통과 · 출력 걸림 · 손풀이 건너뜀 · 규칙 통과 · 구조 걸림 · 경계 건너뜀");
    expect(md).toContain("  - print(리스트)는 대괄호와 쉼표까지 찍는다 [출력]");
    expect(md).toContain("- 개념: print-unpack, zip");
    expect(md).toContain("- 다시 풀기: 2026-11-20");
    expect(md).toContain("- 자주 걸린 질문: 출력 1번, 구조 1번");
  });
});

describe("난이도 찾기", () => {
  it("본문 앞부분의 한 줄 난이도", () => {
    expect(detectDifficulty("두 개의 격자 비교하기\n\nEasy\n\n문제")).toBe("Easy");
    expect(detectDifficulty("제목\n문제\nEasy한 문제입니다")).toBeNull();
  });
});

describe("새 풀이 시작 시각 (기록 id 겹침 방지)", () => {
  it("기존 기록이 없으면 지금", () => {
    const now = new Date("2026-11-20T02:06:30Z");
    expect(nextStartTime([], now)).toBe(now);
  });
  it("가장 늦은 기록과 같은 분이면 그다음 분 0초", () => {
    const now = new Date("2026-11-20T02:06:50Z");
    expect(nextStartTime(["2026-11-20T11:06:37+09:00"], now).toISOString()).toBe("2026-11-20T02:07:00.000Z");
  });
  it("앞으로 밀린 기록(다음 분)보다 이르면 그 기록의 다음 분", () => {
    const now = new Date("2026-11-20T02:06:50Z");
    const out = nextStartTime(["2026-11-20T02:06:37+00:00", "2026-11-20T02:07:00+00:00"], now);
    expect(out.toISOString()).toBe("2026-11-20T02:08:00.000Z");
  });
  it("이미 다음 분이 지났으면 지금", () => {
    const now = new Date("2026-11-20T02:09:10Z");
    expect(nextStartTime(["2026-11-20T02:06:37+00:00"], now)).toBe(now);
  });
});
