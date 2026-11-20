// LLM에게 시키는 좁은 일들: 채점, 힌트, 자유 질문. 프롬프트를 만들고 응답을 검사한다.
// 각 함수는 연결부(LlmProvider)만 받는다. 어떤 연결 방식인지 모른다.

import { LlmError, type ChatTurn, type CompleteRequest, type LlmProvider } from "../llm/types";
import { questionDef } from "./questions";

export interface ProblemContext {
  title: string | null;
  statement: string;
  tex: string[];
}

export interface PreviousAnswer {
  q: number;
  /** 학생이 통과한 답의 요약, 또는 공개된 답 */
  text: string;
  /** 세 번째 '다시'로 공개된 답이면 true (학생이 쓴 답이 아님) */
  revealed: boolean;
}

export interface GradeInput {
  problem: ProblemContext;
  q: number;
  answer: string;
  /** 화면 순서에서 앞 칸들의 답 (문맥으로만 쓴다) */
  previous: PreviousAnswer[];
  /** 이번이 몇 번째 제출인가 (1부터). 3이면 마지막 */
  attempt: number;
  /** 에디터 언어 (python3 등). 모르면 null */
  language: string | null;
}

export type Verdict = "pass" | "partial" | "retry";

export interface GradeResult {
  verdict: Verdict;
  /** 통과·보완 통과일 때 학생 답을 한 줄로 접은 것 */
  summary: string;
  /** 보완 통과면 덧붙임 한 줄, 다시면 틀린 위치를 짚는 한 줄, 통과면 빈 글자 */
  feedback: string;
  /** 마지막 시도에서 '다시'일 때만: 이 칸의 모범 답. 그 밖에는 빈 글자 */
  modelAnswer: string;
}

export interface HintInput {
  problem: ProblemContext;
  /** 질문 힌트면 질문 번호 */
  q: number | null;
  /** 1 질문, 2 방향, 3 코드 한 줄, 4 정답 */
  level: 1 | 2 | 3 | 4;
  answer: string | null;
  code: string | null;
  /** 이미 준 힌트 (같은 말을 반복하지 않게) */
  given: string[];
  language?: string | null;
}

export interface ChatInput {
  problem: ProblemContext;
  history: ChatTurn[];
  message: string;
  code: string | null;
  language?: string | null;
}

export const MAX_ATTEMPTS = 3;

const COACH = [
  "너는 코딩 테스트 입문자를 돕는 학습 코치다. 학생은 코드트리(codetree.ai)에서 문제를 푼다.",
  "학생이 스스로 생각하게 돕는 것이 목적이다. 정답 코드나 완성된 풀이를 먼저 주지 않는다.",
  "한국어로, 짧게 쓴다. 기본은 한두 줄이다. 말투는 '~요'로 한다.",
].join("\n");

/** 파이썬일 때 채점·힌트에 덧붙이는 사실들. 동작 사실과 도구 이름은 말해도 되고, 완성된 답 줄은 주지 않는다 */
const PYTHON_FACTS = [
  "학생은 파이썬으로 푼다. 아래 사실은 필요할 때 짚어도 된다(동작 설명과 도구 이름까지만, 완성된 답 코드는 주지 않는다).",
  "- 파이썬은 단순 연산을 1초에 약 1,000만 번으로 어림한다. 1억 번이면 시간 초과다.",
  "- input()으로 받은 값은 글자다. 수로 쓰려면 바꿔야 한다.",
  "- 리스트를 그대로 print하면 [1, 2]처럼 대괄호와 쉼표까지 찍힌다.",
  "- 입력이 수십만 줄이면 sys.stdin.readline, 큐는 collections.deque(list.pop(0)은 느리다).",
  "- [[0]*m]*n은 같은 줄을 n번 가리킨다.",
  "- list, max, min, sum, input, str 같은 이름을 변수로 쓰면 나중에 오류가 난다. 그런 이름이면 다른 이름을 권한다(판정은 바꾸지 않는다).",
].join("\n");

const STATEMENT_LIMIT = 6000;

const isPython = (lang: string | null | undefined) => !!lang && /^py/i.test(lang);

export function problemBlock(p: ProblemContext): string {
  const parts = [`<problem title="${(p.title ?? "제목 없음").replace(/"/g, "'")}">`, p.statement.slice(0, STATEMENT_LIMIT)];
  if (p.tex.length) parts.push(`수식 원문: ${p.tex.slice(0, 30).join(" ; ")}`);
  parts.push("</problem>");
  return parts.join("\n");
}

function previousBlock(prev: PreviousAnswer[]): string {
  if (!prev.length) return "";
  const lines = prev.map((p) => {
    const d = questionDef(p.q);
    return p.revealed ? `- ${d.short}: (학생이 못 풀어 공개한 답) ${p.text}` : `- ${d.short}: ${p.text}`;
  });
  return `앞 칸의 답(이름은 여기서 붙인 것을 쓴다):\n${lines.join("\n")}\n\n`;
}

// ---------- 채점 ----------

export const GRADE_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["pass", "partial", "retry"] },
    summary: { type: "string" },
    feedback: { type: "string" },
    modelAnswer: { type: "string" },
  },
  required: ["verdict", "summary", "feedback", "modelAnswer"],
  additionalProperties: false,
} as const;

export function buildGradeRequest(input: GradeInput): CompleteRequest {
  const def = questionDef(input.q);
  const last = input.attempt >= MAX_ATTEMPTS;
  const system = [
    COACH,
    "",
    `지금 할 일은 하나다: 학생이 "${def.short}" 칸("${def.text}")에 쓴 답을 판정한다.`,
    `통과 기준: ${def.criteria}`,
    "공통: 이 칸이 묻는 것만 본다. 앞 칸 내용을 요구하지 않는다. 더 써도 감점하지 않는다. 변수 이름은 무엇이든 된다. 학생 답의 코드 한 줄은 허용하고 그 코드가 실제로 하는 일로 판단한다. 애매하면 통과 쪽으로 판정한다.",
    "",
    "판정(verdict):",
    "- pass: 통과.",
    "- partial: 보완 통과. 그대로 코딩해도 틀리지 않지만 빠진 것이 하나 있다.",
    "- retry: 다시. 이대로 코딩하면 틀리는 오류가 있을 때만.",
    "",
    "JSON 하나만 출력한다: {\"verdict\", \"summary\", \"feedback\", \"modelAnswer\"}",
    "- summary: pass·partial이면 학생 답을 다듬은 한 줄 요약(50자 안팎, 새 정보를 덧붙이지 않는다). retry면 빈 글자.",
    "- feedback: pass면 빈 글자. partial이면 '하나만 더: ...' 한 줄. retry면 틀린 위치나 종류를 짚는 한 줄(정답 값은 말하지 않는다).",
    def.correctOnSecond && input.attempt >= 2
      ? "- 이번은 두 번째 이상의 시도다. 이 칸은 읽기 문제라 retry면 feedback에서 무엇이 맞는지 바로 정정해도 된다."
      : "- retry의 feedback은 되묻는 말이나 위치 짚기로 한다.",
    last
      ? "- 이번이 마지막 시도다. retry면 modelAnswer에 이 칸의 모범 답을 쓰는 틀 모양으로 짧게 쓴다(코드는 쓰지 않는다). pass·partial이면 빈 글자."
      : "- modelAnswer는 빈 글자.",
    "- 코드 블록은 쓰지 않는다.",
    isPython(input.language) ? `\n${PYTHON_FACTS}` : "",
  ]
    .filter((x) => x !== "")
    .join("\n");
  const user =
    `${problemBlock(input.problem)}\n\n${previousBlock(input.previous)}` +
    `칸: ${def.short} — ${def.text}\n시도: ${input.attempt}번째${last ? " (마지막)" : ""}\n` +
    `<student_answer>\n${input.answer}\n</student_answer>`;
  return {
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: def.heavy ? 6000 : 2000,
    jsonSchema: GRADE_SCHEMA,
    effort: def.heavy ? "medium" : "low",
  };
}

/** 응답 글자에서 판정을 꺼낸다. 코드 울타리나 앞뒤 말이 섞여도 첫 JSON 객체를 찾는다 */
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
  const d = data as Record<string, unknown>;
  // 예전 모양 {pass, feedback}도 받아 준다
  let verdict: Verdict | null = null;
  if (d.verdict === "pass" || d.verdict === "partial" || d.verdict === "retry") verdict = d.verdict;
  else if (typeof d.pass === "boolean") verdict = d.pass ? "pass" : "retry";
  if (!verdict) throw new LlmError("other", "채점 응답 모양이 다릅니다");
  const str = (v: unknown) => (typeof v === "string" ? oneLine(stripCode(v)) : "");
  let summary = str(d.summary);
  let feedback = str(d.feedback);
  if (!("verdict" in d) && verdict === "pass") {
    summary = feedback;
    feedback = "";
  }
  if (verdict !== "retry" && !summary) summary = "통과";
  if (verdict === "retry" && !feedback) feedback = "조금 더 생각해 볼까요?";
  if (verdict === "pass") feedback = "";
  const modelAnswer = typeof d.modelAnswer === "string" ? stripCode(d.modelAnswer).trim().slice(0, 400) : "";
  return { verdict, summary, feedback, modelAnswer: verdict === "retry" ? modelAnswer : "" };
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
  const def = input.q ? questionDef(input.q) : null;
  const target = def ? `"${def.short}" 칸("${def.text}")` : "이 문제";
  const system = [
    COACH,
    "",
    `지금 할 일은 하나다: ${target}에 대한 힌트를 준다.`,
    LEVEL_RULE[input.level],
    def ? `이 칸의 힌트 안내: ${def.hintGuide}` : "",
    "이미 준 힌트와 같은 말을 반복하지 않는다.",
    isPython(input.language) ? `\n${PYTHON_FACTS}` : "",
  ]
    .filter((x) => x !== "")
    .join("\n");
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
    isPython(input.language) ? `\n${PYTHON_FACTS}` : "",
  ]
    .filter((x) => x !== "")
    .join("\n");
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
