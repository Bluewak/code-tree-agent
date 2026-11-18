// 기록 스키마 (schemaVersion 1, 고정). docs/BUILD_BRIEF.md 6번.
// 원칙: 필드는 빼지 않는다. 값이 없으면 null. 정해지지 않은 필드도 넣지 않는다. 통계는 저장하지 않는다.

export const SCHEMA_VERSION = 1 as const;

export const GAP_TAGS = ["리스트 동작", "이터레이터", "입력", "출력", "디버깅", "코테 감각", "2차원 순회"] as const;
export type GapTag = (typeof GAP_TAGS)[number];

export type QuestionState = "passed" | "failed" | "skipped" | "not_reached";

export interface AttemptRecord {
  schemaVersion: 1;
  id: string;
  site: "codetree";
  problemId: string;
  title: string;
  difficulty: string | null;
  language: string | null;
  startedAt: string;
  finishedAt: string | null;
  result: "passed" | "gave_up" | null;
  questions: { q: 1 | 2 | 3 | 4 | 5 | 6; state: QuestionState }[];
  runs: { total: number; errors: number; mismatches: number };
  hints: { maxLevel: 0 | 1 | 2 | 3; answerRevealed: boolean };
  gaps: { text: string; q: 1 | 2 | 3 | 4 | 5 | 6 | null; tag: GapTag | null }[];
  concepts: string[];
  reviewAt: string | null;
}

export interface ConceptRecord {
  schemaVersion: 1;
  id: string;
  name: string;
  rule: string | null;
  state: "explained" | "typed";
  firstSeenAt: string;
  typedAt: string | null;
  seenIn: string[];
}

export type Validation = { ok: true } | { ok: false; errors: string[] };

// ---------- 검사 도구 ----------

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

class Checker {
  errors: string[] = [];
  constructor(private obj: Record<string, unknown>) {}

  /** 정확히 이 필드들만 있어야 한다 */
  exactKeys(path: string, o: Record<string, unknown>, keys: readonly string[]) {
    for (const k of keys) if (!(k in o)) this.errors.push(`${path}${k}: 필드가 없음`);
    for (const k of Object.keys(o)) if (!keys.includes(k)) this.errors.push(`${path}${k}: 정해지지 않은 필드`);
  }
  check(path: string, ok: boolean, msg: string) {
    if (!ok) this.errors.push(`${path}: ${msg}`);
  }
  get(k: string) {
    return this.obj[k];
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNonEmpty = (v: unknown): v is string => isStr(v) && v.trim().length > 0;
const isNat = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const nullOr = (v: unknown, f: (v: unknown) => boolean) => v === null || f(v);
const isQ = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 6;

const ATTEMPT_KEYS = [
  "schemaVersion", "id", "site", "problemId", "title", "difficulty", "language", "startedAt", "finishedAt",
  "result", "questions", "runs", "hints", "gaps", "concepts", "reviewAt",
] as const;

export function validateAttempt(x: unknown): Validation {
  if (!isObj(x)) return { ok: false, errors: ["객체가 아님"] };
  const c = new Checker(x);
  c.exactKeys("", x, ATTEMPT_KEYS);
  c.check("schemaVersion", x.schemaVersion === SCHEMA_VERSION, "1이어야 함");
  c.check("site", x.site === "codetree", '"codetree"여야 함');
  c.check("problemId", isNonEmpty(x.problemId), "빈 문자열이 아니어야 함");
  c.check("title", isNonEmpty(x.title), "빈 문자열이 아니어야 함");
  c.check("difficulty", nullOr(x.difficulty, isNonEmpty), "문자열 또는 null");
  c.check("language", nullOr(x.language, isNonEmpty), "문자열 또는 null");
  c.check("startedAt", isStr(x.startedAt) && ISO_DATETIME.test(x.startedAt), "시간대가 붙은 ISO 날짜시간");
  c.check("finishedAt", nullOr(x.finishedAt, (v) => isStr(v) && ISO_DATETIME.test(v)), "ISO 날짜시간 또는 null");
  c.check("result", x.result === null || x.result === "passed" || x.result === "gave_up", "passed / gave_up / null");
  if (x.result !== null && x.result !== undefined) c.check("finishedAt", x.finishedAt !== null, "끝난 풀이는 finishedAt이 있어야 함");
  if (isStr(x.id) && isStr(x.problemId) && isStr(x.startedAt)) {
    c.check("id", x.id === `codetree:${x.problemId}:${x.startedAt.slice(0, 16)}`, "codetree:<problemId>:<startedAt 앞 16자>여야 함");
  } else c.check("id", false, "문자열이어야 함");

  // questions: 항상 6칸, 1~6 순서
  if (Array.isArray(x.questions)) {
    c.check("questions", x.questions.length === 6, "항상 6칸");
    x.questions.forEach((q, i) => {
      const p = `questions[${i}]`;
      if (!isObj(q)) return c.check(p, false, "객체가 아님");
      c.exactKeys(`${p}.`, q, ["q", "state"]);
      c.check(`${p}.q`, q.q === i + 1, `${i + 1}이어야 함`);
      c.check(`${p}.state`, ["passed", "failed", "skipped", "not_reached"].includes(q.state as string), "passed / failed / skipped / not_reached");
    });
  } else c.check("questions", false, "배열이어야 함");

  if (isObj(x.runs)) {
    c.exactKeys("runs.", x.runs, ["total", "errors", "mismatches"]);
    const { total, errors, mismatches } = x.runs;
    c.check("runs", isNat(total) && isNat(errors) && isNat(mismatches), "0 이상의 정수");
    if (isNat(total) && isNat(errors) && isNat(mismatches)) c.check("runs", errors + mismatches <= total, "errors + mismatches ≤ total");
  } else c.check("runs", false, "객체여야 함");

  if (isObj(x.hints)) {
    c.exactKeys("hints.", x.hints, ["maxLevel", "answerRevealed"]);
    c.check("hints.maxLevel", Number.isInteger(x.hints.maxLevel) && (x.hints.maxLevel as number) >= 0 && (x.hints.maxLevel as number) <= 3, "0~3");
    c.check("hints.answerRevealed", typeof x.hints.answerRevealed === "boolean", "true/false");
  } else c.check("hints", false, "객체여야 함");

  if (Array.isArray(x.gaps)) {
    x.gaps.forEach((g, i) => {
      const p = `gaps[${i}]`;
      if (!isObj(g)) return c.check(p, false, "객체가 아님");
      c.exactKeys(`${p}.`, g, ["text", "q", "tag"]);
      c.check(`${p}.text`, isNonEmpty(g.text), "빈 문자열이 아니어야 함");
      c.check(`${p}.q`, nullOr(g.q, isQ), "1~6 또는 null");
      c.check(`${p}.tag`, g.tag === null || (GAP_TAGS as readonly unknown[]).includes(g.tag), `고정 목록(${GAP_TAGS.join(", ")}) 또는 null`);
    });
  } else c.check("gaps", false, "배열이어야 함");

  if (Array.isArray(x.concepts)) {
    x.concepts.forEach((k, i) => c.check(`concepts[${i}]`, isStr(k) && SLUG.test(k), "소문자·숫자·하이픈 id"));
    c.check("concepts", new Set(x.concepts).size === x.concepts.length, "중복 없음");
  } else c.check("concepts", false, "배열이어야 함");

  c.check("reviewAt", nullOr(x.reviewAt, (v) => isStr(v) && ISO_DATE.test(v)), "YYYY-MM-DD 또는 null");
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true };
}

const CONCEPT_KEYS = ["schemaVersion", "id", "name", "rule", "state", "firstSeenAt", "typedAt", "seenIn"] as const;

export function validateConcept(x: unknown): Validation {
  if (!isObj(x)) return { ok: false, errors: ["객체가 아님"] };
  const c = new Checker(x);
  c.exactKeys("", x, CONCEPT_KEYS);
  c.check("schemaVersion", x.schemaVersion === SCHEMA_VERSION, "1이어야 함");
  c.check("id", isStr(x.id) && SLUG.test(x.id), "소문자·숫자·하이픈 id");
  c.check("name", isNonEmpty(x.name), "빈 문자열이 아니어야 함");
  c.check("rule", nullOr(x.rule, isNonEmpty), "문자열 또는 null");
  c.check("state", x.state === "explained" || x.state === "typed", "explained / typed");
  c.check("firstSeenAt", isStr(x.firstSeenAt) && ISO_DATE.test(x.firstSeenAt), "YYYY-MM-DD");
  c.check("typedAt", nullOr(x.typedAt, (v) => isStr(v) && ISO_DATE.test(v)), "YYYY-MM-DD 또는 null");
  if (x.state === "typed") c.check("typedAt", x.typedAt !== null, "typed면 typedAt이 있어야 함");
  if (x.state === "explained") c.check("typedAt", x.typedAt === null, "explained면 typedAt은 null");
  if (Array.isArray(x.seenIn)) x.seenIn.forEach((s, i) => c.check(`seenIn[${i}]`, isNonEmpty(s), "풀이 기록 id"));
  else c.check("seenIn", false, "배열이어야 함");
  return c.errors.length ? { ok: false, errors: c.errors } : { ok: true };
}
