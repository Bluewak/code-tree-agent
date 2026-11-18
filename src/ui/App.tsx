// 서랍 전체. 화면: 접힌 손잡이 / 풀기 전 / 막혔을 때 / 풀고 난 뒤 / 설정

import { useEffect, useState } from "preact/hooks";
import type { ProblemSnapshot, SiteReader } from "../sites/types";
import type { Settings } from "../storage/settings";

import { IconBack, IconClose, IconGear } from "./icons";
import { SettingsView } from "./SettingsView";

export type Tab = "before" | "stuck" | "after";

export interface AppProps {
  reader: SiteReader;
  /** 콘텐츠 스크립트가 넘겨주는 열림 상태 제어 */
  open: boolean;
  setOpen: (open: boolean) => void;
  settings: Settings;
  /** URL이 바뀔 때마다 증가 (SPA 이동 감지) */
  pageKey: number;
}

type ProblemState = { status: "loading" } | { status: "none" } | { status: "ready"; problem: ProblemSnapshot };

export function App({ reader, open, setOpen, settings, pageKey }: AppProps) {
  const [problem, setProblem] = useState<ProblemState>({ status: "loading" });
  const [tab, setTab] = useState<Tab>("before");
  const [view, setView] = useState<"main" | "settings">("main");

  useEffect(() => {
    let alive = true;
    setProblem({ status: "loading" });
    reader.readProblem().then((p) => {
      if (alive) setProblem(p ? { status: "ready", problem: p } : { status: "none" });
    });
    return () => {
      alive = false;
    };
  }, [reader, pageKey]);

  const side = settings.side;
  const title = problem.status === "ready" ? (problem.problem.title ?? problem.problem.problemId) : "코드트리 학습 서랍";

  return (
    <div class="root">
      {!settings.handleHidden && !open && (
        <button class={`handle ${side}`} aria-label="학습 서랍 열기" title="학습 서랍 열기" onClick={() => setOpen(true)}>
          {side === "right" ? "<" : ">"}
        </button>
      )}
      <aside class={`drawer ${side}${open ? " open" : ""}`} aria-hidden={!open} aria-label="코드트리 학습 서랍">
        <div class="head">
          {view !== "main" && (
            <button class="icon-btn" aria-label="뒤로" title="뒤로" onClick={() => setView("main")}>
              <IconBack />
            </button>
          )}
          <div class="titles">
            <h1 title={title}>{view === "settings" ? "설정" : title}</h1>
            {view === "main" && problem.status === "ready" && <div class="sub">{problem.problem.problemId}</div>}
          </div>
          {view === "main" && (
            <button class="icon-btn" aria-label="설정" title="설정" onClick={() => setView("settings")}>
              <IconGear />
            </button>
          )}
          <button class="icon-btn" aria-label="서랍 닫기" title="닫기 (Esc)" onClick={() => setOpen(false)}>
            <IconClose />
          </button>
        </div>
        {view === "settings" && (
          <div class="body">
            <SettingsView settings={settings} />
          </div>
        )}
        {view === "main" && <><div class="tabs" role="tablist">
          {(
            [
              ["before", "풀기 전"],
              ["stuck", "막혔을 때"],
              ["after", "풀고 난 뒤"],
            ] as const
          ).map(([id, label]) => (
            <button role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        <div class="body">
          {problem.status === "loading" && <div class="card muted"><span class="spin" /> 문제를 읽는 중…</div>}
          {problem.status === "none" && (
            <div class="card muted">이 페이지에서 문제를 찾지 못했습니다. 코드트리 문제 페이지에서 열어 주세요.</div>
          )}
          {problem.status === "ready" && tab === "before" && <ProblemCard problem={problem.problem} />}
          {problem.status === "ready" && tab === "stuck" && (
            <div class="card muted">코드를 실행한 뒤 막히면 여기서 나의 출력과 정답을 나란히 봅니다. (준비 중)</div>
          )}
          {problem.status === "ready" && tab === "after" && <div class="card muted">풀고 나면 여기서 정리합니다. (준비 중)</div>}
        </div></>}
      </aside>
    </div>
  );
}

export function ProblemCard({ problem, defaultOpen = true }: { problem: ProblemSnapshot; defaultOpen?: boolean }) {
  return (
    <details class="card problem" open={defaultOpen}>
      <summary>문제 본문</summary>
      <div class="statement">{problem.statement || "본문을 읽지 못했습니다."}</div>
    </details>
  );
}

