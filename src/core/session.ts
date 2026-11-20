// 한 문제를 한 번 푸는 동안의 상태와 그 상태를 바꾸는 순수 함수들.
// 화면은 이 함수들만 부른다. 저장할 때는 storage/records.ts가 풀이 기록(스키마)으로 바꾼다.

import type { ChatTurn } from "../llm/types";
import { DISPLAY_ORDER, displayIndex, initialQuestions, type QuestionProgress } from "./questions";
import { CODE_NUDGE, FREE_CHAT_LIMIT, MAX_ATTEMPTS, type GradeResult, type PreviousAnswer } from "./tasks";

export interface Session {
  site: "codetree";
  problemId: string;
  title: string | null;
  language: string | null;
  /** ISO 문자열(현지 시간대 오프셋 포함) */
  startedAt: string;
  finishedAt: string | null;
  result: "passed" | "gave_up" | null;
  questions: QuestionProgress[];
  /** 문제 전체 힌트 사다리(질문 → 방향 → 코드 한 줄 → 정답) 전용. 6개 질문 칸의 힌트는 넣지 않는다 */
  hints: { maxLevel: 0 | 1 | 2 | 3; answerRevealed: boolean };
  runs: { total: number; errors: number; mismatches: number };
  chat: ChatTurn[];
  /** 질문·코드 없이 이어진 자유 질문 수 */
  freeStreak: number;
  /** "코드를 쳐 보세요"로 넘겼을 때의 코드. 코드가 바뀌면 다시 질문할 수 있다 */
  codeAtNudge: string | null;
}

/** 2026-11-18T16:08:00+09:00 모양 (현지 시간) */
export function localIso(d: Date): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
  );
}

export function newSession(p: { problemId: string; title: string | null; language: string | null }, now = new Date()): Session {
  return {
    site: "codetree",
    problemId: p.problemId,
    title: p.title,
    language: p.language,
    startedAt: localIso(now),
    finishedAt: null,
    result: null,
    questions: initialQuestions(),
    hints: { maxLevel: 0, answerRevealed: false },
    runs: { total: 0, errors: 0, mismatches: 0 },
    chat: [],
    freeStreak: 0,
    codeAtNudge: null,
  };
}

/** 지금 큰 카드로 보여 줄 질문 번호 (화면 순서에서 처음 남은 칸). 다 끝났으면 null */
export function currentQ(s: Session): number | null {
  for (const q of DISPLAY_ORDER) {
    const p = s.questions.find((x) => x.q === q);
    if (p && !p.resolved) return q;
  }
  return null;
}

/** 진행 막대용: 끝난(통과·건너뜀·답 공개) 칸 수 */
export function progressCount(s: Session): number {
  return s.questions.filter((q) => q.resolved).length;
}

/** 화면 순서에서 q보다 앞에 있는 칸 */
export function isBefore(a: number, b: number): boolean {
  return displayIndex(a) < displayIndex(b);
}

/** 채점 문맥: 화면 순서에서 q 앞 칸들의 답 (통과 요약 또는 공개된 답) */
export function previousAnswers(s: Session, q: number): PreviousAnswer[] {
  const out: PreviousAnswer[] = [];
  for (const dq of DISPLAY_ORDER) {
    if (dq === q) break;
    const p = s.questions.find((x) => x.q === dq);
    if (!p) continue;
    if (p.revealed) out.push({ q: dq, text: p.revealed, revealed: true });
    else if (p.summary) out.push({ q: dq, text: p.summary, revealed: false });
  }
  return out;
}

function updateQ(s: Session, q: number, f: (p: QuestionProgress) => QuestionProgress): Session {
  return { ...s, questions: s.questions.map((p) => (p.q === q ? f(p) : p)), freeStreak: 0, codeAtNudge: null };
}

/**
 * 채점 결과 반영. pass·partial이면 접고 다음으로(partial의 덧붙임은 feedback에 남김).
 * retry면 그 자리. 같은 칸 세 번째 retry면 이 칸의 답을 보여 주고 넘어간다(failed).
 */
export function applyGrade(s: Session, q: number, answer: string, r: GradeResult): Session {
  return updateQ(s, q, (p) => {
    const attempts = p.attempts + 1;
    if (r.verdict !== "retry") {
      return {
        ...p,
        attempts,
        answer,
        resolved: true,
        summary: r.summary,
        feedback: r.verdict === "partial" ? r.feedback : null,
        state: p.state === "failed" ? "failed" : "passed",
      };
    }
    if (attempts >= MAX_ATTEMPTS) {
      return {
        ...p,
        attempts,
        answer,
        resolved: true,
        state: "failed",
        feedback: r.feedback,
        revealed: r.modelAnswer || "(답을 만들지 못했어요. 힌트를 다시 보거나 다음 칸을 먼저 해 보세요.)",
      };
    }
    return { ...p, attempts, answer, state: "failed", feedback: r.feedback };
  });
}

export function skipQuestion(s: Session, q: number): Session {
  return updateQ(s, q, (p) => ({ ...p, resolved: true, state: p.state === "failed" ? "failed" : "skipped" }));
}

/** 질문 힌트는 1단계(질문) → 2단계(방향)까지만 연다 */
export function nextQuestionHintLevel(s: Session, q: number): 1 | 2 | null {
  const n = s.questions.find((p) => p.q === q)?.hints.length ?? 0;
  return n === 0 ? 1 : n === 1 ? 2 : null;
}

/** 칸의 힌트를 더한다. 문제 전체 힌트 사다리(hints.maxLevel)에는 넣지 않는다(지시서 6절) */
export function addHint(s: Session, q: number, text: string): Session {
  return { ...s, questions: s.questions.map((p) => (p.q === q ? { ...p, hints: [...p.hints, text] } : p)) };
}

export type FreeAsk = { ok: true; session: Session } | { ok: false; session: Session; nudge: string };

/** 자유 질문을 보내도 되는가. 5번 넘게 이어지면 LLM을 부르지 않고 "코드를 쳐 보세요"로 넘긴다 */
export function checkFreeAsk(s: Session, code: string | null): FreeAsk {
  let session = s;
  if (s.codeAtNudge !== null && code !== null && code !== s.codeAtNudge) {
    session = { ...s, freeStreak: 0, codeAtNudge: null }; // 코드를 고쳤으면 다시 질문할 수 있다
  }
  if (session.freeStreak >= FREE_CHAT_LIMIT) {
    return { ok: false, nudge: CODE_NUDGE, session: { ...session, codeAtNudge: session.codeAtNudge ?? code ?? "" } };
  }
  return { ok: true, session };
}

export function addChat(s: Session, message: string, reply: string): Session {
  return {
    ...s,
    chat: [...s.chat, { role: "user", content: message }, { role: "assistant", content: reply }],
    freeStreak: s.freeStreak + 1,
  };
}
