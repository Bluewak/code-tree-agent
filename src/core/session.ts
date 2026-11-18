// 한 문제를 한 번 푸는 동안의 상태와 그 상태를 바꾸는 순수 함수들.
// 화면은 이 함수들만 부른다. 저장할 때는 storage/records.ts가 풀이 기록(스키마)으로 바꾼다.

import type { ChatTurn } from "../llm/types";
import { initialQuestions, type QuestionProgress } from "./questions";
import { CODE_NUDGE, FREE_CHAT_LIMIT, type GradeResult } from "./tasks";

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

/** 지금 큰 카드로 보여 줄 질문 번호. 다 끝났으면 null */
export function currentQ(s: Session): number | null {
  return s.questions.find((q) => !q.resolved)?.q ?? null;
}

/** 진행 막대용: 통과했거나 건너뛴 질문 수 */
export function progressCount(s: Session): number {
  return s.questions.filter((q) => q.resolved).length;
}

function updateQ(s: Session, q: number, f: (p: QuestionProgress) => QuestionProgress): Session {
  return { ...s, questions: s.questions.map((p) => (p.q === q ? f(p) : p)), freeStreak: 0, codeAtNudge: null };
}

export function applyGrade(s: Session, q: number, answer: string, r: GradeResult): Session {
  return updateQ(s, q, (p) => {
    const attempts = p.attempts + 1;
    if (r.pass) {
      return {
        ...p,
        attempts,
        answer,
        resolved: true,
        summary: r.feedback,
        feedback: null,
        state: p.state === "failed" ? "failed" : "passed",
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

export function addHint(s: Session, q: number | null, text: string, level: 1 | 2 | 3 | 4): Session {
  const capped = Math.min(level, 3) as 1 | 2 | 3;
  const hints = {
    maxLevel: Math.max(s.hints.maxLevel, capped) as Session["hints"]["maxLevel"],
    answerRevealed: s.hints.answerRevealed || level === 4,
  };
  const questions = q === null ? s.questions : s.questions.map((p) => (p.q === q ? { ...p, hints: [...p.hints, text] } : p));
  return { ...s, questions, hints };
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
