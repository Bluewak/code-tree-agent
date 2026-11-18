// 사이트별 읽기 모듈이 지켜야 할 모양. 나머지 코드는 이 타입만 안다.

export type SiteId = "codetree";

export interface ProblemSnapshot {
  site: SiteId;
  problemId: string;
  url: string;
  /** 문제 제목. 못 찾으면 null */
  title: string | null;
  /** 난이도 글자(예: Easy). 못 찾으면 null */
  difficulty: string | null;
  /** 문제 본문, 예제, 제한 조건 (화면 글자) */
  statement: string;
  /** KaTeX 수식 원문 */
  tex: string[];
}

export interface CodeSnapshot {
  code: string | null;
  language: string | null;
  /** 어디서 읽었는지. 둘 다 실패하면 null */
  source: "ide-storage" | "monaco" | null;
}

export type RunResult =
  | { kind: "none" }
  | { kind: "error"; message: string }
  | { kind: "mismatch"; mine: string; expected: string; time: string | null; memory: string | null }
  | { kind: "pass"; mine: string | null; time: string | null; memory: string | null };

export interface SiteReader {
  site: SiteId;
  /** 이 URL이 이 사이트의 문제 페이지인가 */
  problemIdFromUrl(url: string): string | null;
  /** 페이지가 다 그려질 때까지 기다린 뒤 문제를 읽는다 */
  readProblem(): Promise<ProblemSnapshot | null>;
  readCode(): Promise<CodeSnapshot>;
  readRunResult(): RunResult;
}
