// LLM에게 시키는 좁은 일들: 채점, 힌트, 자유 질문. 프롬프트를 만들고 응답을 검사한다.
// 각 함수는 연결부(LlmProvider)만 받는다. 어떤 연결 방식인지 모른다.

import { LlmError, type ChatTurn, type CompleteRequest, type LlmProvider } from "../llm/types";
import { questionDef } from "./questions";

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
}

export interface ChatInput {
  problem: ProblemContext;
  history: ChatTurn[];
  message: string;
  code: string | null;
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
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new LlmError("other", "채점 응답을 읽지 못했습니다");
  let data: unknown;
  try {
    data = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new LlmError("other", "채점 응답을 읽지 못했습니다");
  }
  const d = data as { pass?: unknown; feedback?: unknown };
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
  if (input.given.length) parts.push(`이미 준 힌트:\n${input.given.map((h) => `- ${h}`).join("\n")}`);
  return { system, messages: [{ role: "user", content: parts.join("\n\n") }], maxTokens: 2000 };
}

/** 1~2단계 힌트에 코드가 섞이면 걸러 낸다 */
export function filterHint(text: string, level: HintInput["level"]): string {
  let out = text.trim();
  if (level <= 2) out = stripCode(out);
  return out.replace(/\n{3,}/g, "\n\n").trim();
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

// ---------- 공통 ----------

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

function oneLine(s: string): string {
  return s.replace(/\s*\n+\s*/g, " ").trim().slice(0, 200);
}
