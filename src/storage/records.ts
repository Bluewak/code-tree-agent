// 풀이 기록: 진행 상태(Session) → 기록(AttemptRecord) 변환, 저장, 통계 계산, 글(마크다운) 출력.
// JSON 기록이 원본이다. 통계와 글은 저장하지 않고 매번 만든다.

import { normalizeSession, type Session } from "../core/session";
import { QUESTIONS } from "../core/questions";
import { validateAttempt, type AttemptRecord } from "./schema";

export const RECORDS_KEY = "records";
export const ACTIVE_KEY = "active";

export function recordId(s: Pick<Session, "site" | "problemId" | "startedAt">): string {
  return `${s.site}:${s.problemId}:${s.startedAt.slice(0, 16)}`;
}

/** 손을 댄 풀이인가 (문제 페이지를 열기만 한 것은 기록하지 않는다) */
export function isTouched(s: Session): boolean {
  return s.questions.some((q) => q.state !== "not_reached") || s.chat.length > 0 || s.hints.maxLevel > 0 || s.runs.total > 0 || s.result !== null;
}

export function sessionToRecord(s: Session, difficulty: string | null = null): AttemptRecord {
  return {
    schemaVersion: 1,
    id: recordId(s),
    site: s.site,
    problemId: s.problemId,
    title: s.title?.trim() || s.problemId,
    difficulty,
    language: s.language,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    result: s.result,
    questions: s.questions.map((q) => ({ q: q.q, state: q.state })),
    runs: { ...s.runs },
    hints: { ...s.hints },
    gaps: [],
    concepts: [],
    reviewAt: null,
  };
}

// ---------- 저장 (chrome.storage.local) ----------

type ActiveMap = Record<string, { session: Session; difficulty: string | null }>;

async function getMap<T>(key: string): Promise<Record<string, T>> {
  const v = (await chrome.storage.local.get(key))[key];
  return v && typeof v === "object" ? (v as Record<string, T>) : {};
}

// 읽고-고치고-쓰기가 겹치지 않게 한 줄로 세운다 (탭 여러 개에서 동시에 저장할 때)
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(f: () => Promise<T>): Promise<T> {
  const run = queue.then(f, f);
  queue = run.catch(() => {});
  return run;
}

/** 검사를 통과한 기록만 저장한다. 진행 중이면 이어서 풀 수 있게 진행 상태도 둔다 */
export function saveSession(s: Session, difficulty: string | null): Promise<AttemptRecord> {
  return serial(() => saveSessionNow(s, difficulty));
}

async function saveSessionNow(s: Session, difficulty: string | null): Promise<AttemptRecord> {
  const record = sessionToRecord(s, difficulty);
  const v = validateAttempt(record);
  if (!v.ok) throw new Error(`기록 형식 오류: ${v.errors.join("; ")}`);
  const [records, active] = await Promise.all([getMap<AttemptRecord>(RECORDS_KEY), getMap<ActiveMap[string]>(ACTIVE_KEY)]);
  records[record.id] = record;
  if (s.result === null) active[s.problemId] = { session: s, difficulty };
  else if (active[s.problemId]?.session.startedAt === s.startedAt) delete active[s.problemId];
  await chrome.storage.local.set({ [RECORDS_KEY]: records, [ACTIVE_KEY]: active });
  return record;
}

/** 이 문제의 진행 중인 풀이 */
export async function loadActive(problemId: string): Promise<Session | null> {
  const s = (await getMap<ActiveMap[string]>(ACTIVE_KEY))[problemId]?.session;
  return s ? normalizeSession(s) : null;
}

export async function listRecords(): Promise<AttemptRecord[]> {
  const all = Object.values(await getMap<AttemptRecord>(RECORDS_KEY)).filter((r) => validateAttempt(r).ok);
  return all.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

// ---------- 통계 (저장하지 않고 매번 계산) ----------

export interface Stats {
  attempts: number;
  problems: number;
  passed: number;
  gaveUp: number;
  ongoing: number;
  /** 질문별로 틀린 적 있는 횟수 (1~6) */
  failedByQ: number[];
}

export function computeStats(records: AttemptRecord[]): Stats {
  const failedByQ = [0, 0, 0, 0, 0, 0];
  for (const r of records) for (const q of r.questions) if (q.state === "failed") failedByQ[q.q - 1]!++;
  return {
    attempts: records.length,
    problems: new Set(records.map((r) => r.problemId)).size,
    passed: records.filter((r) => r.result === "passed").length,
    gaveUp: records.filter((r) => r.result === "gave_up").length,
    ongoing: records.filter((r) => r.result === null).length,
    failedByQ,
  };
}

// ---------- 글로 출력 ----------

const STATE_MARK = { passed: "통과", failed: "걸림", skipped: "건너뜀", not_reached: "안 함" } as const;
const RESULT_TEXT = { passed: "통과", gave_up: "그만둠" } as const;

export function resultText(r: AttemptRecord["result"]): string {
  return r === null ? "진행 중" : RESULT_TEXT[r];
}

function when(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

export function recordsToMarkdown(records: AttemptRecord[], today = new Date()): string {
  const st = computeStats(records);
  const lines: string[] = [];
  const d = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  lines.push(`# 내 기록 (${d})`, "");
  lines.push(`- 풀이 ${st.attempts}번 (문제 ${st.problems}개): 통과 ${st.passed}, 그만둠 ${st.gaveUp}, 진행 중 ${st.ongoing}`);
  const worst = QUESTIONS.map((q, i) => ({ short: q.short, n: st.failedByQ[i]! }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  if (worst.length) lines.push(`- 자주 걸린 질문: ${worst.map((w) => `${w.short} ${w.n}번`).join(", ")}`);
  for (const r of records) {
    lines.push("", `## ${r.title} (${when(r.startedAt)})`, "");
    lines.push(`- 문제: ${r.problemId}${r.difficulty ? ` · ${r.difficulty}` : ""}${r.language ? ` · ${r.language}` : ""}`);
    lines.push(`- 결과: ${resultText(r.result)}${r.finishedAt ? ` (${when(r.finishedAt)})` : ""}`);
    lines.push(`- 질문: ${r.questions.map((q) => `${QUESTIONS[q.q - 1]!.short} ${STATE_MARK[q.state]}`).join(" · ")}`);
    lines.push(`- 실행: ${r.runs.total}번 (오류 ${r.runs.errors}, 출력 다름 ${r.runs.mismatches})`);
    lines.push(`- 힌트: ${r.hints.maxLevel === 0 ? "안 봄" : `${r.hints.maxLevel}단계까지`}${r.hints.answerRevealed ? ", 정답 봄" : ""}`);
    if (r.gaps.length) {
      lines.push("- 몰랐던 것:");
      for (const g of r.gaps) lines.push(`  - ${g.text}${g.tag ? ` [${g.tag}]` : ""}`);
    }
    if (r.concepts.length) lines.push(`- 개념: ${r.concepts.join(", ")}`);
    if (r.reviewAt) lines.push(`- 다시 풀기: ${r.reviewAt}`);
  }
  return lines.join("\n") + "\n";
}
