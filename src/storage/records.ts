// 풀이 기록: 진행 상태(Session) → 기록(AttemptRecord) 변환, 저장, 통계 계산, 글(마크다운) 출력.
// JSON 기록이 원본이다. 통계와 글은 저장하지 않고 매번 만든다.

import type { Session } from "../core/session";
import { QUESTIONS } from "../core/questions";
import { validateAttempt, type AttemptRecord } from "./schema";

export const RECORDS_KEY = "records";
export const ACTIVE_KEY = "active";

export function recordId(s: Pick<Session, "site" | "problemId" | "startedAt">): string {
  return `${s.site}:${s.problemId}:${s.startedAt.slice(0, 16)}`;
}

/**
 * 새 풀이의 시작 시각. 기록 id가 분 단위라, 이 문제의 기존 기록과 같은 분(또는 그 앞)이면
 * 가장 늦은 기록의 다음 분 0초로 둔다. 그래야 끝낸 기록을 덮어쓰지 않는다.
 */
export function nextStartTime(existingStartedAt: string[], now = new Date()): Date {
  let latest = -Infinity;
  for (const s of existingStartedAt) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) latest = Math.max(latest, t);
  }
  if (latest === -Infinity) return now;
  const nextMinute = (Math.floor(latest / 60000) + 1) * 60000;
  return now.getTime() >= nextMinute ? now : new Date(nextMinute);
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
  const existing = records[record.id];
  if (existing && existing.startedAt !== record.startedAt) {
    // 같은 분에 시작한 다른 풀이: 덮어쓰지 않는다
    throw new Error("같은 시각에 시작한 다른 풀이 기록이 있어 저장하지 않았습니다. 1분 뒤 \"처음부터 다시\"를 눌러 주세요.");
  }
  records[record.id] = record;
  if (s.result === null) active[s.problemId] = { session: s, difficulty };
  else if (active[s.problemId]?.session.startedAt === s.startedAt) delete active[s.problemId];
  await chrome.storage.local.set({ [RECORDS_KEY]: records, [ACTIVE_KEY]: active });
  return record;
}

/**
 * 진행 중인 풀이를 버린다("처음부터 다시"). 아직 안 끝난 기록만 지우고, 끝난 기록은 남긴다.
 * 저장과 같은 줄에 세우므로, 먼저 보낸 자동 저장이 나중에 기록을 되살리지 않는다.
 */
export function discardSession(problemId: string, startedAt: string): Promise<void> {
  return serial(async () => {
    const [records, active] = await Promise.all([getMap<AttemptRecord>(RECORDS_KEY), getMap<ActiveMap[string]>(ACTIVE_KEY)]);
    const id = recordId({ site: "codetree", problemId, startedAt });
    if (records[id]?.result === null) delete records[id];
    if (active[problemId]?.session.startedAt === startedAt) delete active[problemId];
    await chrome.storage.local.set({ [RECORDS_KEY]: records, [ACTIVE_KEY]: active });
  });
}

/** 풀이 기록 하나를 지운다. 진행 중이던 풀이면 이어 풀기 상태도 지운다 */
export function deleteRecord(id: string): Promise<void> {
  return serial(async () => {
    const [records, active] = await Promise.all([getMap<AttemptRecord>(RECORDS_KEY), getMap<ActiveMap[string]>(ACTIVE_KEY)]);
    const r = records[id];
    delete records[id];
    if (r && active[r.problemId] && recordId(active[r.problemId]!.session) === id) delete active[r.problemId];
    await chrome.storage.local.set({ [RECORDS_KEY]: records, [ACTIVE_KEY]: active });
  });
}

/** 모든 풀이 기록과 이어 풀기 상태를 지운다. 설정과 키는 그대로 둔다 */
export function clearRecords(): Promise<void> {
  return serial(() => chrome.storage.local.set({ [RECORDS_KEY]: {}, [ACTIVE_KEY]: {} }));
}

/** 이 문제의 진행 중인 풀이 */
export async function loadActive(problemId: string): Promise<Session | null> {
  return (await getMap<ActiveMap[string]>(ACTIVE_KEY))[problemId]?.session ?? null;
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
