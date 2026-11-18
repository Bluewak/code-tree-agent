// 코드트리 읽기 모듈 (DOM 쪽). 화면에 있는 것만 읽는다. 코드트리 API를 부르지 않고, 에디터를 바꾸지 않는다.

import type { CodeSnapshot, ProblemSnapshot, RunResult, SiteReader } from "../types";
import { cleanTitle, detectDifficulty, extractStatement, parseIdeStorage, parseProblemId, parseRunResult } from "./parse";
import { MAIN_WORLD_REPLY, MAIN_WORLD_REQUEST } from "../../mainworld/protocol";

const IDE_STORAGE_KEY = "ide-storage";

/** 페이지가 브라우저에서 그려지므로, 글자가 일정 시간 바뀌지 않을 때까지 기다린다 */
export function waitForStableText(doc: Document, { minLength = 200, quietMs = 600, timeoutMs = 15000 } = {}): Promise<string> {
  return new Promise((resolve) => {
    let last = "";
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      observer.disconnect();
      clearTimeout(quietTimer);
      clearTimeout(hardTimer);
      resolve(doc.body?.innerText ?? "");
    };
    const check = () => {
      const now = doc.body?.innerText ?? "";
      if (now !== last) last = now;
      clearTimeout(quietTimer);
      if (now.length >= minLength) quietTimer = setTimeout(finish, quietMs);
    };
    const observer = new MutationObserver(check);
    observer.observe(doc.documentElement, { childList: true, subtree: true, characterData: true });
    const hardTimer = setTimeout(finish, timeoutMs);
    check();
  });
}

function readTitle(doc: Document): string | null {
  for (const sel of ["h1", "h2", "[class*='title' i]"]) {
    for (const el of Array.from(doc.querySelectorAll<HTMLElement>(sel))) {
      if (el.closest("#codetree-study-agent-root")) continue;
      const t = el.innerText?.trim();
      if (t && t.length <= 80 && !/코드트리|codetree/i.test(t)) return t;
    }
  }
  return cleanTitle(doc.title);
}

function readTex(doc: Document): string[] {
  return Array.from(doc.querySelectorAll('annotation[encoding="application/x-tex"]'))
    .map((a) => a.textContent?.trim() ?? "")
    .filter(Boolean);
}

/** 예비 경로: 메인 월드 스크립트에게 Monaco 값을 물어본다 */
function askMainWorld(win: Window, timeoutMs = 1500): Promise<Pick<CodeSnapshot, "code" | "language"> | null> {
  return new Promise((resolve) => {
    const reqId = Math.random().toString(36).slice(2);
    const onMsg = (e: MessageEvent) => {
      if (e.source !== win || e.data?.type !== MAIN_WORLD_REPLY || e.data.reqId !== reqId) return;
      win.removeEventListener("message", onMsg);
      clearTimeout(timer);
      resolve(typeof e.data.code === "string" ? { code: e.data.code, language: e.data.language ?? null } : null);
    };
    const timer = setTimeout(() => {
      win.removeEventListener("message", onMsg);
      resolve(null);
    }, timeoutMs);
    win.addEventListener("message", onMsg);
    win.postMessage({ type: MAIN_WORLD_REQUEST, reqId }, win.location.origin);
  });
}

export function createCodetreeReader(win: Window = window): SiteReader {
  const doc = win.document;

  async function readCode(): Promise<CodeSnapshot> {
    let fromStorage: ReturnType<typeof parseIdeStorage>;
    try {
      fromStorage = parseIdeStorage(win.localStorage.getItem(IDE_STORAGE_KEY));
    } catch {
      fromStorage = null; // 저장소 접근이 막힌 경우
    }
    if (fromStorage) return { ...fromStorage, source: "ide-storage" };
    const fromMonaco = await askMainWorld(win);
    if (fromMonaco) return { ...fromMonaco, source: "monaco" };
    return { code: null, language: null, source: null };
  }

  return {
    site: "codetree",
    problemIdFromUrl: parseProblemId,
    async readProblem(): Promise<ProblemSnapshot | null> {
      const problemId = parseProblemId(win.location.href);
      if (!problemId) return null;
      const text = await waitForStableText(doc);
      const title = readTitle(doc);
      const { code } = await readCode();
      const statement = extractStatement(text, title, code);
      return {
        site: "codetree",
        problemId,
        url: win.location.href,
        title,
        difficulty: detectDifficulty(statement),
        statement,
        tex: readTex(doc),
      };
    },
    readCode,
    readRunResult(): RunResult {
      return parseRunResult(doc.body?.innerText ?? "");
    },
  };
}
