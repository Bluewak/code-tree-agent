// 코드트리 화면 글자를 해석하는 순수 함수 모음. DOM을 만지지 않으므로 표본 글자로 테스트한다.
// 코드트리 내부 구조(ide-storage 등)에 기대는 부분은 모두 이 파일과 reader.ts에만 둔다.

import type { CodeSnapshot, RunResult } from "../types";

const STATEMENT_LIMIT = 8000;

/** 예: /ko/trails/complete/curated-cards/intro-compare-two-grids/description → intro-compare-two-grids */
export function parseProblemId(url: string): string | null {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const m = path.match(/\/(?:curated-cards|problems)\/([^/]+)/);
  if (m?.[1]) return decodeURIComponent(m[1]);
  const parts = path.split("/").filter(Boolean);
  const i = parts.lastIndexOf("description");
  if (i > 0) return decodeURIComponent(parts[i - 1]!);
  return null;
}

/** localStorage["ide-storage"]의 JSON에서 코드와 언어를 꺼낸다. 구조가 다르면 null */
export function parseIdeStorage(raw: string | null): Pick<CodeSnapshot, "code" | "language"> | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const state = (data as { state?: unknown })?.state as { code?: unknown; language?: unknown } | undefined;
  if (!state || typeof state.code !== "string") return null;
  return {
    code: state.code,
    language: typeof state.language === "string" && state.language ? state.language.toLowerCase() : null,
  };
}

/** document.title 등에서 사이트 이름을 떼어 낸다 */
export function cleanTitle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(/\s+[|·–-]\s+/)[0]?.trim() ?? "";
  if (!first || /^code\s*tree$|^코드트리$/i.test(first)) return null;
  return first;
}

/**
 * 화면 전체 글자에서 문제 부분만 잘라 낸다.
 * 끝: 에디터 코드가 시작되는 곳 또는 "테스트케이스" 라벨 앞. 시작: 제목이 처음 나오는 곳.
 */
export function extractStatement(innerText: string, title: string | null, code: string | null): string {
  let text = innerText.replace(/\r\n/g, "\n");
  let end = text.length;
  const codeHead = code?.trim().split("\n")[0]?.trim();
  if (codeHead && codeHead.length >= 4) {
    const at = text.indexOf(codeHead);
    if (at > 0) end = Math.min(end, at);
  }
  const tc = text.indexOf("\n테스트케이스\n");
  if (tc > 0) end = Math.min(end, tc);
  let start = 0;
  if (title) {
    const at = text.indexOf(title);
    if (at >= 0 && at < end) start = at;
  }
  text = text.slice(start, end).replace(/\n{3,}/g, "\n\n").trim();
  return text.length > STATEMENT_LIMIT ? text.slice(0, STATEMENT_LIMIT) + "\n…(이하 생략)" : text;
}

/** 본문 앞부분에서 난이도 글자를 찾는다 (한 줄을 통째로 차지할 때만) */
export function detectDifficulty(statement: string): string | null {
  const head = statement.split("\n").slice(0, 12);
  for (const line of head) {
    const m = line.trim().match(/^(Easy|Medium|Hard|쉬움|보통|어려움)$/i);
    if (m) return m[1]!;
  }
  return null;
}

const LABEL_MINE = "나의 출력";
const LABEL_EXPECTED = "정답";
const STOP_LABELS = ["상세 정보", "수행 시간", "메모리", "코드 실행", "제출 및 채점", "테스트케이스", LABEL_EXPECTED, LABEL_MINE];
const ERROR_LINE = /^(Traceback \(most recent call last\):|[A-Za-z_][\w.]*(?:Error|Exception)\b.*|.*(?:컴파일 에러|런타임 에러|시간 초과|메모리 초과).*)$/m;

/** 출력 비교용: 줄 끝 공백과 끝의 빈 줄을 무시한다 */
export function normalizeOutput(s: string): string {
  return s
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n+$/, "")
    .replace(/^\n+/, "");
}

/** 라벨이 한 줄을 통째로 차지하는 위치를 찾는다 (라벨 요소 안에 아이콘이 있어도 innerText에서는 라벨 글자만 남는다) */
function findLabel(text: string, label: string, from = 0): number {
  const re = new RegExp(`(^|\\n)[ \\t]*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*(?=\\n|$)`, "g");
  re.lastIndex = from;
  const m = re.exec(text);
  return m ? m.index + m[1]!.length : -1;
}

function sectionAfter(text: string, label: string): string | null {
  const at = findLabel(text, label);
  if (at < 0) return null;
  const bodyStart = text.indexOf("\n", at);
  if (bodyStart < 0) return "";
  let end = text.length;
  for (const stop of STOP_LABELS) {
    if (stop === label) continue;
    const s = findLabel(text, stop, bodyStart);
    if (s >= 0 && s < end) end = s;
  }
  return text.slice(bodyStart + 1, end);
}

function valueAfter(text: string, label: string): string | null {
  const at = findLabel(text, label);
  if (at < 0) return null;
  const rest = text.slice(at + label.length).split("\n").map((l) => l.trim()).filter(Boolean);
  return rest[0] ?? null;
}

/**
 * 실행 결과 영역을 해석한다. 세 종류: 오류 / 출력 불일치 / 통과. 결과가 없으면 none.
 * 결과 영역은 마지막 "테스트케이스" 라벨 뒤라고 본다(그 앞은 문제와 에디터).
 */
export function parseRunResult(innerText: string): RunResult {
  const text = innerText.replace(/\r\n/g, "\n");
  let regionStart = -1;
  for (let i = findLabel(text, "테스트케이스"); i >= 0; i = findLabel(text, "테스트케이스", i + 1)) regionStart = i;
  const region = regionStart >= 0 ? text.slice(regionStart) : text.slice(-4000);

  const mine = sectionAfter(region, LABEL_MINE);
  const expected = sectionAfter(region, LABEL_EXPECTED);
  const time = valueAfter(region, "수행 시간");
  const memory = valueAfter(region, "메모리");

  const err = region.match(ERROR_LINE);
  if (err && !(mine !== null && expected !== null && !ERROR_LINE.test(mine))) {
    const from = err.index ?? 0;
    const lines = region.slice(from).split("\n").filter((l) => l.trim());
    // Traceback이면 마지막 오류 줄까지, 아니면 그 줄 하나
    let message = lines[0] ?? "";
    if (message.startsWith("Traceback")) {
      const last = lines.findIndex((l, i) => i > 0 && /^[A-Za-z_][\w.]*(?:Error|Exception)\b/.test(l.trim()));
      message = lines.slice(0, last >= 0 ? last + 1 : Math.min(lines.length, 8)).join("\n");
    }
    return { kind: "error", message: message.trim() };
  }

  if (mine !== null && expected !== null) {
    const a = normalizeOutput(mine);
    const b = normalizeOutput(expected);
    if (a === b) return { kind: "pass", mine: a, time, memory };
    return { kind: "mismatch", mine: a, expected: b, time, memory };
  }
  if (time !== null) return { kind: "pass", mine: mine !== null ? normalizeOutput(mine) : null, time, memory };
  return { kind: "none" };
}
