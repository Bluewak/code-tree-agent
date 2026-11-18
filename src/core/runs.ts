// 실행 결과: 새 실행 감지, 실행 횟수 세기, 나의 출력과 정답 비교. 모두 순수 함수라 표본으로 테스트한다.

import type { RunResult } from "../sites/types";

/** 화면에 뜬 실행 결과를 구분하는 값. 수행 시간까지 넣어 같은 출력을 다시 실행해도 대개 다른 값이 된다 */
export function runSignature(r: RunResult): string {
  return r.kind === "none" ? "none" : JSON.stringify(r);
}

/**
 * 화면을 읽을 때마다 observe()에 넣으면, 새 실행 결과가 떴을 때만 그 결과를 돌려준다.
 * - 처음 읽은 값은 기준으로만 삼는다(페이지를 열기 전에 떠 있던 결과는 세지 않는다).
 * - 결과가 사라졌다가(none) 다시 뜨면 같은 내용이어도 새 실행이다.
 * - 같은 결과가 그대로 있으면 세지 않는다.
 */
export function createRunDetector() {
  let last: string | null = null;
  return {
    observe(r: RunResult): Exclude<RunResult, { kind: "none" }> | null {
      const sig = runSignature(r);
      if (last === null) {
        last = sig;
        return null;
      }
      if (sig === last) return null;
      last = sig;
      return r.kind === "none" ? null : r;
    },
  };
}

export interface LineDiff {
  /** 나의 출력 줄마다 정답과 다른가 */
  mine: boolean[];
  /** 정답 줄마다 나의 출력과 다른가 */
  expected: boolean[];
  /** 처음 다른 줄 (1부터). 같으면 null */
  firstDiff: number | null;
  mineLines: number;
  expectedLines: number;
}

/** 줄 단위 비교 (줄 끝 공백 무시). 같은 번째 줄끼리 비교한다 */
export function diffLines(mine: string, expected: string): LineDiff {
  const a = mine.split("\n").map((l) => l.replace(/\s+$/, ""));
  const b = expected.split("\n").map((l) => l.replace(/\s+$/, ""));
  const n = Math.max(a.length, b.length);
  let firstDiff: number | null = null;
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) {
      firstDiff = i + 1;
      break;
    }
  }
  return {
    mine: a.map((l, i) => l !== b[i]),
    expected: b.map((l, i) => l !== a[i]),
    firstDiff,
    mineLines: a.length,
    expectedLines: b.length,
  };
}

/** 출력 불일치를 한 줄로 설명한다 (LLM 없이) */
export function describeMismatch(d: LineDiff): string {
  const parts: string[] = [];
  if (d.firstDiff !== null) parts.push(`${d.firstDiff}번째 줄부터 다릅니다.`);
  if (d.mineLines !== d.expectedLines) parts.push(`줄 수가 다릅니다 (나의 출력 ${d.mineLines}줄, 정답 ${d.expectedLines}줄).`);
  return parts.join(" ") || "공백이나 보이지 않는 글자가 다를 수 있습니다.";
}
