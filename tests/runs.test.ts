// M5: 실행 결과 감지, 실행 횟수, 출력 비교, 힌트 사다리, 코드 리뷰

import { readFileSync } from "node:fs";
import { createRunDetector, describeMismatch, diffLines } from "../src/core/runs";
import { parseRunResult } from "../src/sites/codetree/parse";
import {
  addHint,
  applyRun,
  newSession,
  nextLadderLevel,
  normalizeSession,
  setReview,
  showRun,
  type Session,
  type ShownRun,
} from "../src/core/session";
import {
  buildChatRequest,
  buildHintRequest,
  buildReviewRequest,
  filterHint,
  hint,
  keepOneCodeLine,
  parseReview,
  review,
  runBlock,
} from "../src/core/tasks";
import { createFakeProvider } from "../src/llm/fake";
import { LlmError } from "../src/llm/types";
import { sessionToRecord } from "../src/storage/records";
import { validateAttempt } from "../src/storage/schema";

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const problem = { title: "두 개의 격자 비교하기", statement: "격자 두 개를 비교한다", tex: [] };
const base = () => newSession({ problemId: "p", title: "t", language: "python" }, new Date(2026, 10, 18, 16, 8));
const shown = (name: string) => parseRunResult(fx(name)) as ShownRun;

describe("실행 결과 3종을 각각 인식한다 (표본)", () => {
  it("오류 / 출력 불일치 / 통과 / 결과 없음", () => {
    expect(parseRunResult(fx("codetree-error.txt")).kind).toBe("error");
    expect(parseRunResult(fx("codetree-traceback.txt")).kind).toBe("error");
    expect(parseRunResult(fx("codetree-mismatch.txt")).kind).toBe("mismatch");
    expect(parseRunResult(fx("codetree-pass.txt")).kind).toBe("pass");
    expect(parseRunResult(fx("codetree-noresult.txt")).kind).toBe("none");
  });
});

describe("새 실행 감지", () => {
  it("처음 떠 있던 결과는 세지 않는다", () => {
    const d = createRunDetector();
    expect(d.observe(parseRunResult(fx("codetree-mismatch.txt")))).toBeNull();
    expect(d.observe(parseRunResult(fx("codetree-mismatch.txt")))).toBeNull();
  });
  it("결과가 바뀔 때마다 한 번씩 알린다: 없음 → 오류 → 불일치 → 통과", () => {
    const d = createRunDetector();
    expect(d.observe(parseRunResult(fx("codetree-noresult.txt")))).toBeNull();
    expect(d.observe(parseRunResult(fx("codetree-error.txt")))?.kind).toBe("error");
    expect(d.observe(parseRunResult(fx("codetree-error.txt")))).toBeNull(); // 그대로면 세지 않음
    expect(d.observe(parseRunResult(fx("codetree-mismatch.txt")))?.kind).toBe("mismatch");
    expect(d.observe(parseRunResult(fx("codetree-pass.txt")))?.kind).toBe("pass");
  });
  it("같은 결과라도 사라졌다 다시 뜨면 새 실행이다", () => {
    const d = createRunDetector();
    d.observe(parseRunResult(fx("codetree-error.txt")));
    expect(d.observe(parseRunResult(fx("codetree-noresult.txt")))).toBeNull();
    expect(d.observe(parseRunResult(fx("codetree-error.txt")))?.kind).toBe("error");
  });
  it("출력이 같아도 수행 시간이 다르면 새 실행이다", () => {
    const d = createRunDetector();
    const t = fx("codetree-mismatch.txt");
    d.observe(parseRunResult(t));
    expect(d.observe(parseRunResult(t.replace("52ms", "50ms")))?.kind).toBe("mismatch");
  });
});

describe("실행 횟수 (기록의 runs)", () => {
  it("오류와 출력 불일치를 따로 센다", () => {
    let s = base();
    s = applyRun(s, shown("codetree-error.txt"));
    s = applyRun(s, shown("codetree-mismatch.txt"));
    s = applyRun(s, shown("codetree-mismatch.txt"));
    s = applyRun(s, shown("codetree-pass.txt"));
    expect(s.runs).toEqual({ total: 4, errors: 1, mismatches: 2 });
    expect(s.lastRun?.result.kind).toBe("pass");
    const rec = sessionToRecord(s);
    expect(rec.runs).toEqual({ total: 4, errors: 1, mismatches: 2 });
    expect(validateAttempt(rec).ok).toBe(true);
  });
  it("끝낸 풀이는 횟수를 바꾸지 않는다", () => {
    const s = applyRun({ ...base(), result: "passed" }, shown("codetree-error.txt"));
    expect(s.runs.total).toBe(0);
    expect(s.lastRun?.result.kind).toBe("error");
  });
  it("화면에서 다시 읽기는 보여 주기만 한다", () => {
    const s = showRun(base(), shown("codetree-error.txt"));
    expect(s.runs.total).toBe(0);
    expect(s.lastRun?.result.kind).toBe("error");
  });
  it("예전 모양의 진행 상태에 새 칸을 채운다", () => {
    const old = base() as Partial<Session>;
    delete old.lastRun;
    delete old.ladder;
    delete old.review;
    const s = normalizeSession(old as Session);
    expect(s.lastRun).toBeNull();
    expect(s.ladder).toEqual([]);
    expect(s.review).toBeNull();
  });
});

describe("나의 출력과 정답 비교", () => {
  it("다른 줄을 표시하고 처음 다른 줄을 알려 준다", () => {
    const d = diffLines("[0, 0]\n[0, 1]", "0 0\n0 1");
    expect(d.mine).toEqual([true, true]);
    expect(d.firstDiff).toBe(1);
    expect(describeMismatch(d)).toBe("1번째 줄부터 다릅니다.");
  });
  it("줄 수가 다르면 그것도 말한다 (줄 끝 공백 무시)", () => {
    const d = diffLines("0 0 \n0 1", "0 0\n0 1\n1 1");
    expect(d.mine).toEqual([false, false]);
    expect(d.expected).toEqual([false, false, true]);
    expect(describeMismatch(d)).toBe("3번째 줄부터 다릅니다. 줄 수가 다릅니다 (나의 출력 2줄, 정답 3줄).");
  });
});

describe("힌트 사다리", () => {
  it("1 → 2 → 3 → 4단계, 4단계를 열면 정답 봄", () => {
    let s = base();
    expect(nextLadderLevel(s)).toBe(1);
    s = addHint(s, null, "h1", 1);
    s = addHint(s, null, "h2", 2);
    s = addHint(s, null, "h3", 3);
    expect(nextLadderLevel(s)).toBe(4);
    expect(s.hints).toEqual({ maxLevel: 3, answerRevealed: false });
    s = addHint(s, null, "h4", 4);
    expect(nextLadderLevel(s)).toBeNull();
    expect(s.ladder).toEqual(["h1", "h2", "h3", "h4"]);
    expect(s.hints).toEqual({ maxLevel: 3, answerRevealed: true });
    expect(s.questions.every((q) => q.hints.length === 0)).toBe(true);
  });
  it("힌트 요청에 지금 코드와 실행 결과가 들어간다", () => {
    const req = buildHintRequest({
      problem,
      q: null,
      level: 2,
      answer: null,
      code: "print(a)",
      given: ["h1"],
      run: shown("codetree-mismatch.txt"),
    });
    expect(req.system).toContain("힌트 2단계");
    expect(req.messages[0]!.content).toContain("<my_output>\n[0, 0]\n[0, 1]\n</my_output>");
    expect(req.messages[0]!.content).toContain("<expected_output>\n0 0\n0 1\n</expected_output>");
    expect(req.messages[0]!.content).toContain("- h1");
  });
  it("오류면 오류 메시지가 들어간다", () => {
    expect(runBlock(shown("codetree-error.txt"))).toContain("ValueError: not enough values to unpack");
    expect(runBlock(null)).toBe("실행 결과: 아직 없음");
  });
  it("3단계는 코드 한 줄만 남긴다", () => {
    const t = "이 줄을 보세요.\n```python\n\nprint(*row)\nfor x in y:\n    pass\n```\n그리고\n```\nmore()\n```";
    expect(keepOneCodeLine(t)).toBe("이 줄을 보세요.\n```python\nprint(*row)\n```\n그리고\n");
    expect(filterHint(t, 3)).toBe("이 줄을 보세요.\n```python\nprint(*row)\n```\n그리고");
  });
  it("4단계는 거르지 않는다", () => {
    const t = "```python\na = 1\nb = 2\n```";
    expect(filterHint(t, 4)).toBe(t);
  });
  it("1~2단계 사다리 힌트도 코드가 걸러진다", async () => {
    const p = createFakeProvider(() => "어느 줄에서 오류가 났나요?\n```python\nn, m = map(int, input().split())\n```");
    expect(await hint(p, { problem, q: null, level: 1, answer: null, code: "x", given: [], run: null })).toBe("어느 줄에서 오류가 났나요?");
  });
  it("자유 질문에도 실행 결과를 붙일 수 있다", () => {
    const req = buildChatRequest({ problem, history: [], message: "왜 틀려요?", code: "x", run: shown("codetree-error.txt") });
    expect(req.messages[0]!.content).toContain("실행 결과: 오류");
    const before = buildChatRequest({ problem, history: [], message: "?", code: null });
    expect(before.messages[0]!.content).not.toContain("실행 결과");
  });
});

describe("코드 리뷰", () => {
  const good = JSON.stringify({
    correct: { ok: false, comment: "print(리스트)가 무엇을 찍는지 보세요." },
    readable: { ok: true, comment: "이름이 분명합니다." },
    simpler: { ok: false, comment: "zip을 쓰면 짧아집니다.\n```python\nfor a, b in zip(x, y):\n    print(a)\n```" },
  });
  it("3항목을 JSON 스키마로 묻고, 통과 전에는 고친 코드를 주지 말라고 한다", () => {
    const req = buildReviewRequest({ problem, code: "print(a)", language: "python", run: shown("codetree-mismatch.txt") });
    expect(req.jsonSchema).toBeDefined();
    expect(req.system).toContain("correct(맞는가)");
    expect(req.system).toContain("readable(읽기 쉬운가)");
    expect(req.system).toContain("simpler(더 단순한 길이 있는가)");
    expect(req.system).toContain("고친 코드나 정답을 주지 말고");
    expect(req.messages[0]!.content).toContain("<code>\nprint(a)\n</code>");
    const passed = buildReviewRequest({ problem, code: "x", language: null, run: shown("codetree-pass.txt") });
    expect(passed.system).toContain("예제를 통과했다");
  });
  it("응답을 읽고 코멘트의 코드 블록은 지운다", () => {
    const r = parseReview("```json\n" + good + "\n```");
    expect(r.correct).toEqual({ ok: false, comment: "print(리스트)가 무엇을 찍는지 보세요." });
    expect(r.readable.ok).toBe(true);
    expect(r.simpler.comment).toBe("zip을 쓰면 짧아집니다.");
  });
  it("모양이 다르면 오류", () => {
    expect(() => parseReview("좋은 코드네요")).toThrow(LlmError);
    expect(() => parseReview(JSON.stringify({ correct: { ok: true, comment: "x" } }))).toThrow(LlmError);
  });
  it("가짜 연결로 리뷰를 받아 진행 상태에 둔다", async () => {
    const p = createFakeProvider(() => good);
    const items = await review(p, { problem, code: "print(a)", language: "python", run: null });
    const s = setReview(base(), items, "print(a)");
    expect(s.review?.items.correct.ok).toBe(false);
    expect(s.review?.code).toBe("print(a)");
    expect(p.calls).toHaveLength(1);
  });
});
