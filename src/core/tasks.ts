// LLM에게 시키는 좁은 일들: 채점, 힌트, 자유 질문. 프롬프트를 만들고 응답을 검사한다.
// 각 함수는 연결부(LlmProvider)만 받는다. 어떤 연결 방식인지 모른다.

import { LlmError, type ChatTurn, type CompleteRequest, type LlmProvider } from "../llm/types";
import { questionDef } from "./questions";
import type { RunResult } from "../sites/types";
import type { ReviewItem, ReviewItems } from "./session";

export interface ProblemContext {
  title: string | null;
  statement: string;
  tex: string[];
}

export interface GradeInput {
  problem: ProblemContext;
  q: number;
  answer: string;
  /** 앞에서 통과한 답 (문맥으로만 쓴다) */
  previous: { q: number; summary: string }[];
}

export interface GradeResult {
  pass: boolean;
  feedback: string;
}

export interface HintInput {
  problem: ProblemContext;
  /** 질문 힌트면 질문 번호 */
  q: number | null;
  /** 1 질문, 2 방향, 3 코드 한 줄, 4 정답 */
  level: 1 | 2 | 3 | 4;
  answer: string | null;
  code: string | null;
  /** 이미 받은 힌트 (같은 말을 반복하지 않게) */
  given: string[];
  /** 마지막 실행 결과 (막혔을 때 힌트) */
  run?: RunResult | null;
}

export interface ChatInput {
  problem: ProblemContext;
  history: ChatTurn[];
  message: string;
  code: string | null;
  run?: RunResult | null;
}

export interface ReviewInput {
  problem: ProblemContext;
  code: string;
  language: string | null;
  run: RunResult | null;
}

const COACH = [
  "너는 코딩 테스트 입문자를 돕는 학습 코치다. 학생은 코드트리(codetree.ai)에서 문제를 푼다.",
  "학생이 스스로 생각하게 돕는 것이 목적이다. 정답 코드나 완성된 풀이를 먼저 주지 않는다.",
  "한국어로, 짧게 쓴다. 기본은 한두 줄이다.",
].join("\n");

const STATEMENT_LIMIT = 6000;

export function problemBlock(p: ProblemContext): string {
  const parts = [`<problem title="${(p.title ?? "제목 없음").replace(/"/g, "'")}">`, p.statement.slice(0, STATEMENT_LIMIT)];
  if (p.tex.length) parts.push(`수식 원문: ${p.tex.slice(0, 30).join(" ; ")}`);
  parts.push("</problem>");
  return parts.join("\n");
}

const OUTPUT_LIMIT = 1500;
const clip = (s: string, n = OUTPUT_LIMIT) => (s.length > n ? s.slice(0, n) + "\n…(이하 생략)" : s);

/** 실행 결과를 프롬프트 글로 */
export function runBlock(run: RunResult | null | undefined): string {
  if (!run || run.kind === "none") return "실행 결과: 아직 없음";
  if (run.kind === "error") return `실행 결과: 오류\n<error>\n${clip(run.message)}\n</error>`;
  if (run.kind === "mismatch")
    return `실행 결과: 출력이 정답과 다름\n<my_output>\n${clip(run.mine)}\n</my_output>\n<expected_output>\n${clip(run.expected)}\n</expected_output>`;
  return "실행 결과: 예제 통과";
}

// ---------- 채점 ----------

export const GRADE_SCHEMA = {
  type: "object",
  properties: {
    pass: { type: "boolean" },
    feedback: { type: "string" },
  },
  required: ["pass", "feedback"],
  additionalProperties: false,
} as const;

export function buildGradeRequest(input: GradeInput): CompleteRequest {
  const def = questionDef(input.q);
  const system = [
    COACH,
    "",
    `지금 할 일은 하나다: 학생이 ${def.q}번 질문 "${def.text}"에 쓴 답이 맞는지만 판단한다.`,
    `통과 기준: ${def.criteria}`,
    "핵심을 짚었으면 표현이 서툴러도 통과다. 다른 질문의 내용까지 요구하지 않는다.",
    "",
    "JSON 하나만 출력한다: {\"pass\": true|false, \"feedback\": \"...\"}",
    "- pass가 true면 feedback은 학생 답을 다듬은 한 줄 요약(40자 안팎). 새 정보를 덧붙이지 않는다.",
    "- pass가 false면 feedback은 학생이 다시 생각하게 하는 되묻는 질문 한 줄. 정답이나 고친 답을 말하지 않는다.",
    "- 코드는 쓰지 않는다.",
  ].join("\n");
  const prev = input.previous.length
    ? "앞에서 통과한 답:\n" + input.previous.map((p) => `${p.q}. ${questionDef(p.q).short}: ${p.summary}`).join("\n") + "\n\n"
    : "";
  const user = `${problemBlock(input.problem)}\n\n${prev}${def.q}번 질문: ${def.text}\n<student_answer>\n${input.answer}\n</student_answer>`;
  return { system, messages: [{ role: "user", content: user }], maxTokens: 2000, jsonSchema: GRADE_SCHEMA };
}

/** 응답 글자에서 {pass, feedback}을 꺼낸다. 코드 울타리나 앞뒤 말이 섞여도 첫 JSON 객체를 찾는다 */
export function parseGrade(text: string): GradeResult {
  const d = firstJson(text, "채점 응답을 읽지 못했습니다") as { pass?: unknown; feedback?: unknown };
  if (typeof d.pass !== "boolean" || typeof d.feedback !== "string") throw new LlmError("other", "채점 응답 모양이 다릅니다");
  return { pass: d.pass, feedback: oneLine(stripCode(d.feedback)) || (d.pass ? "통과" : "조금 더 생각해 볼까요?") };
}

export async function grade(provider: LlmProvider, input: GradeInput): Promise<GradeResult> {
  return parseGrade(await provider.complete(buildGradeRequest(input)));
}

// ---------- 힌트 ----------

const LEVEL_RULE: Record<HintInput["level"], string> = {
  1: "힌트 1단계(질문): 학생이 스스로 알아차리게 하는 질문 한 줄만 쓴다. 답이나 방법을 말하지 않는다. 코드는 쓰지 않는다.",
  2: "힌트 2단계(방향): 어떤 방향으로 생각하면 되는지 한두 줄로 말한다. 정답 자체나 코드는 쓰지 않는다.",
  3: "힌트 3단계(코드 한 줄): 핵심이 되는 코드 한 줄만 보여 주고 한 줄로 설명한다. 전체 코드는 쓰지 않는다.",
  4: "힌트 4단계(정답): 정답 풀이를 짧게 설명하고 필요하면 코드를 보여 준다.",
};

export function buildHintRequest(input: HintInput): CompleteRequest {
  const target = input.q ? `${input.q}번 질문 "${questionDef(input.q).text}"` : "이 문제";
  const system = [COACH, "", `지금 할 일은 하나다: ${target}에 대한 힌트를 준다.`, LEVEL_RULE[input.level], "이미 준 힌트와 같은 말을 반복하지 않는다."].join(
    "\n",
  );
  const parts = [problemBlock(input.problem)];
  if (input.answer) parts.push(`학생의 현재 답:\n<student_answer>\n${input.answer}\n</student_answer>`);
  if (input.code) parts.push(`학생의 현재 코드:\n<code>\n${input.code.slice(0, 4000)}\n</code>`);
  if (input.run !== undefined) parts.push(runBlock(input.run));
  if (input.given.length) parts.push(`이미 준 힌트:\n${input.given.map((h) => `- ${h}`).join("\n")}`);
  return { system, messages: [{ role: "user", content: parts.join("\n\n") }], maxTokens: 2000 };
}

/** 1~2단계 힌트에 코드가 섞이면 걸러 낸다. 3단계는 코드를 한 줄만 남긴다 */
export function filterHint(text: string, level: HintInput["level"]): string {
  let out = text.trim();
  if (level <= 2) out = stripCode(out);
  else if (level === 3) out = keepOneCodeLine(out);
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/** 첫 코드 블록의 첫 줄(빈 줄 제외)만 남기고 나머지 코드 블록은 지운다 */
export function keepOneCodeLine(text: string): string {
  let kept = false;
  return text.replace(/```([\w+-]*)\n?([\s\S]*?)(```|$)/g, (_all, lang: string, body: string) => {
    if (kept) return "";
    const line = body.split("\n").find((l) => l.trim());
    if (!line) return "";
    kept = true;
    return "```" + lang + "\n" + line.trimEnd() + "\n```";
  });
}

/** 걸러 낸 뒤 남는 게 없으면 오류(힌트를 쓴 것으로 치지 않는다) */
export async function hint(provider: LlmProvider, input: HintInput): Promise<string> {
  const out = filterHint(await provider.complete(buildHintRequest(input)), input.level);
  if (!out) throw new LlmError("other", "힌트를 만들지 못했습니다. 한 번 더 눌러 주세요");
  return out;
}

// ---------- 자유 질문 ----------

export const FREE_CHAT_LIMIT = 5;
export const CODE_NUDGE = "질문은 여기까지 하고, 이제 코드를 쳐 보세요. 막히면 실행해 보고 다시 물어봐 주세요.";

export function buildChatRequest(input: ChatInput): CompleteRequest {
  const system = [
    COACH,
    "",
    "학생의 자유 질문에 답한다. 두세 줄 안으로 답한다.",
    "문제의 정답 코드나 풀이 전체를 쓰지 않는다. 문법이나 개념 질문에는 짧은 예시 코드를 써도 된다(이 문제의 답이 되지 않게).",
  ].join("\n");
  const context = [problemBlock(input.problem)];
  if (input.code) context.push(`학생의 현재 코드:\n<code>\n${input.code.slice(0, 4000)}\n</code>`);
  if (input.run !== undefined) context.push(runBlock(input.run));
  const history = input.history.slice(-8);
  const messages: ChatTurn[] = [
    { role: "user", content: context.join("\n\n") + "\n\n(위는 문제와 현재 상황이다. 이어지는 질문에 답해 줘.)" },
    { role: "assistant", content: "네, 질문해 주세요." },
    ...history,
    { role: "user", content: input.message },
  ];
  return { system, messages, maxTokens: 3000 };
}

export async function chat(provider: LlmProvider, input: ChatInput): Promise<string> {
  return (await provider.complete(buildChatRequest(input))).trim();
}

// ---------- 코드 리뷰 ----------

const REVIEW_ITEM = {
  type: "object",
  properties: { ok: { type: "boolean" }, comment: { type: "string" } },
  required: ["ok", "comment"],
  additionalProperties: false,
} as const;

export const REVIEW_SCHEMA = {
  type: "object",
  properties: { correct: REVIEW_ITEM, readable: REVIEW_ITEM, simpler: REVIEW_ITEM },
  required: ["correct", "readable", "simpler"],
  additionalProperties: false,
} as const;

export const REVIEW_LABELS: Record<keyof ReviewItems, string> = {
  correct: "맞는가",
  readable: "읽기 쉬운가",
  simpler: "더 단순한 길이 있는가",
};

export function buildReviewRequest(input: ReviewInput): CompleteRequest {
  const passed = input.run?.kind === "pass";
  const system = [
    COACH,
    "",
    "지금 할 일은 하나다: 학생의 코드를 세 가지로 짧게 리뷰한다.",
    "- correct(맞는가): 문제 조건과 실행 결과로 보아 맞게 동작하는가. 틀린 곳이 있으면 어디를 보라고 가리킨다.",
    "- readable(읽기 쉬운가): 이름, 들여쓰기, 쓸데없는 코드가 있는가.",
    "- simpler(더 단순한 길이 있는가): 같은 일을 더 짧고 분명하게 할 방법이 있는가.",
    "",
    "JSON 하나만 출력한다: {\"correct\": {\"ok\": true|false, \"comment\": \"...\"}, \"readable\": {...}, \"simpler\": {...}}",
    "- ok는 그 항목에 고칠 것이 없으면 true, 있으면 false.",
    "- comment는 한두 문장. 코드 블록은 쓰지 않는다. 짧은 함수 이름 정도만 인용한다.",
    passed
      ? "- 학생은 예제를 통과했다. 더 나은 방법은 이름으로 짚어 줘도 된다."
      : "- 학생은 아직 통과하지 못했다. 고친 코드나 정답을 주지 말고, 어디를 다시 보면 되는지만 말한다.",
  ].join("\n");
  const user = [
    problemBlock(input.problem),
    `학생의 코드${input.language ? ` (${input.language})` : ""}:\n<code>\n${input.code.slice(0, 6000)}\n</code>`,
    runBlock(input.run),
  ].join("\n\n");
  return { system, messages: [{ role: "user", content: user }], maxTokens: 3000, jsonSchema: REVIEW_SCHEMA };
}

function parseReviewItem(v: unknown): ReviewItem {
  const d = v as { ok?: unknown; comment?: unknown } | null;
  if (!d || typeof d.ok !== "boolean" || typeof d.comment !== "string") throw new LlmError("other", "코드 리뷰 응답 모양이 다릅니다");
  return { ok: d.ok, comment: oneLine(stripCode(d.comment), 300) || (d.ok ? "괜찮습니다." : "다시 살펴보세요.") };
}

export function parseReview(text: string): ReviewItems {
  const data = firstJson(text, "코드 리뷰 응답을 읽지 못했습니다") as Record<string, unknown>;
  return { correct: parseReviewItem(data.correct), readable: parseReviewItem(data.readable), simpler: parseReviewItem(data.simpler) };
}

export async function review(provider: LlmProvider, input: ReviewInput): Promise<ReviewItems> {
  return parseReview(await provider.complete(buildReviewRequest(input)));
}

// ---------- 공통 ----------

/**
 * 응답 글자에서 JSON 객체를 꺼낸다 (코드 울타리·앞뒤 말 허용).
 * 울타리를 글자에서 지우지 않는다: 첫 { 부터 마지막 } 까지만 잘라도 바깥 울타리는 빠지고,
 * JSON 문자열 안의 ``` 코드 블록은 그대로 남아 stripCode가 지울 수 있다.
 */
function firstJson(text: string, failMessage: string): unknown {
  const cleaned = text.trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new LlmError("other", failMessage);
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new LlmError("other", failMessage);
  }
}

/** 코드 블록(```...```)과 코드로 보이는 줄을 지운다 */
export function stripCode(text: string): string {
  return text
    .replace(/```[\s\S]*?(```|$)/g, "")
    .split("\n")
    .filter((l) => !/^\s{4,}\S/.test(l) && !/^\s*(for|while|if|def|print|import|return)\b.*[:()]\s*$/.test(l))
    .join("\n")
    .replace(/`([^`\n]{40,})`/g, "")
    .trim();
}

function oneLine(s: string, max = 200): string {
  return s.replace(/\s*\n+\s*/g, " ").trim().slice(0, max);
}
