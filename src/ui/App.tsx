// 서랍 전체. 화면: 접힌 손잡이 / 풀기 전 / 막혔을 때 / 풀고 난 뒤 / 설정

import { useEffect, useRef, useState } from "preact/hooks";
import type { ProblemSnapshot, SiteReader } from "../sites/types";
import type { Settings } from "../storage/settings";
import { applyRun, localIso, newSession, normalizeSession, type Session } from "../core/session";
import { isTouched } from "../storage/records";
import { send } from "../messages";
import { IconBack, IconClose, IconGear } from "./icons";
import { SettingsView, useLlmStatus } from "./SettingsView";
import { BeforeView } from "./BeforeView";
import { AfterView, type SaveState } from "./AfterView";
import { CopyButton, RecordsView } from "./RecordsView";
import { StuckView } from "./StuckView";

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

/**
 * 문제마다 풀이 상태 하나. 이 문제의 진행 중인 풀이가 저장돼 있으면 이어서, 없으면 새로 시작한다.
 * 손을 댄 뒤로는 바뀔 때마다 자동 저장한다(0.4초 모아서).
 */
function useSession(problem: ProblemSnapshot | null, reader: SiteReader) {
  const [session, setSession] = useState<Session | null>(null);
  const [save, setSave] = useState<SaveState>({ status: "idle" });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!problem) return;
    if (session?.problemId === problem.problemId) return;
    let alive = true;
    setSave({ status: "idle" });
    (async () => {
      const saved = await send({ type: "session.load", problemId: problem.problemId }).catch(() => null);
      if (!alive) return;
      if (saved) return setSession(normalizeSession(saved));
      const { language } = await reader.readCode();
      if (alive) setSession(newSession({ problemId: problem.problemId, title: problem.title, language }));
    })();
    return () => {
      alive = false;
    };
  }, [problem?.problemId]);

  // 자동 저장
  useEffect(() => {
    if (!session || !problem || session.problemId !== problem.problemId || !isTouched(session)) return;
    clearTimeout(timer.current);
    setSave({ status: "saving" });
    timer.current = setTimeout(() => {
      send({ type: "session.save", session, difficulty: problem.difficulty })
        .then(() => setSave({ status: "saved", at: new Date().toISOString() }))
        .catch((e) => setSave({ status: "error", message: e instanceof Error ? e.message : String(e) }));
    }, 400);
    return () => clearTimeout(timer.current);
  }, [session]);

  const update = (f: (s: Session) => Session) => setSession((s) => (s ? f(s) : s));

  /** 다시 풀면 새 기록. id가 분 단위라 같은 분에 다시 시작하면 시작 시각을 다음 분으로 둔다 */
  const restart = async () => {
    if (!problem || !session) return;
    let now = new Date();
    if (localIso(now).slice(0, 16) === session.startedAt.slice(0, 16)) {
      now = new Date(Math.ceil((now.getTime() + 1) / 60000) * 60000);
    }
    const { language } = await reader.readCode();
    setSave({ status: "idle" });
    setSession(newSession({ problemId: problem.problemId, title: problem.title, language }, now));
  };

  return { session: session?.problemId === problem?.problemId ? session : null, update, save, restart };
}

export function App({ reader, open, setOpen, settings, pageKey }: AppProps) {
  const [problem, setProblem] = useState<ProblemState>({ status: "loading" });
  const [tab, setTab] = useState<Tab>("before");
  const [view, setView] = useState<"main" | "settings" | "records">("main");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const ready = problem.status === "ready" ? problem.problem : null;
  const { session, update, save, restart } = useSession(ready, reader);
  // 서랍을 열 때마다 연결 상태를 새로 읽는다 (설정 페이지에서 키를 넣고 돌아온 경우)
  const [llm] = useLlmStatus([open, settings.provider, settings.model]);
  /** 서랍이 열려 있는 동안 오류·출력 불일치가 나면 "막혔을 때" 탭에 점을 찍는다 */
  const [stuckAlert, setStuckAlert] = useState(false);
  const live = useRef({ open, tab });
  live.current = { open, tab };

  // 실행 결과 지켜보기: 새 실행이 뜨면 횟수를 세고 막혔을 때 화면에 보여 준다
  useEffect(() => {
    const problemId = reader.problemIdFromUrl(location.href);
    if (!problemId) return;
    return reader.watchRuns((r) => {
      update((s) => (s.problemId === problemId ? applyRun(s, r) : s));
      if (r.kind === "pass") return;
      // 닫혀 있으면 다음에 열 때 막혔을 때 화면이 바로 보이게, 열려 있으면 탭에 점만
      if (!live.current.open) setTab("stuck");
      else if (live.current.tab !== "stuck") setStuckAlert(true);
    });
  }, [reader, pageKey]);

  useEffect(() => {
    let alive = true;
    setProblem({ status: "loading" });
    setDrafts({});
    setStuckAlert(false);
    reader.readProblem().then((p) => {
      if (alive) setProblem(p ? { status: "ready", problem: p } : { status: "none" });
    });
    return () => {
      alive = false;
    };
  }, [reader, pageKey]);

  const side = settings.side;
  const title = ready ? (ready.title ?? ready.problemId) : "코드트리 학습 서랍";

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
            <h1 title={title}>{view === "settings" ? "설정" : view === "records" ? "내 기록" : title}</h1>
            {view === "main" && ready && <div class="sub">{ready.problemId}</div>}
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
            <SettingsView settings={settings}>
              <section class="card field">
                <h2>내 기록</h2>
                <p class="small muted">풀이 기록은 이 브라우저 안에 자동으로 저장됩니다. 밖으로 보내지 않습니다.</p>
                <div class="row">
                  <button class="btn primary" onClick={() => setView("records")}>
                    보기
                  </button>
                  <CopyButton />
                </div>
              </section>
            </SettingsView>
          </div>
        )}

        {view === "records" && (
          <div class="body">
            <RecordsView />
          </div>
        )}

        {view === "main" && (
          <>
            <div class="tabs" role="tablist">
              {(
                [
                  ["before", "풀기 전"],
                  ["stuck", "막혔을 때"],
                  ["after", "풀고 난 뒤"],
                ] as const
              ).map(([id, label]) => (
                <button
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => {
                    setTab(id);
                    if (id === "stuck") setStuckAlert(false);
                  }}
                >
                  {label}
                  {id === "stuck" && stuckAlert && tab !== "stuck" && <span class="alert" title="새 실행 결과" />}
                </button>
              ))}
            </div>
            <div class="body">
              {problem.status === "loading" && (
                <div class="card muted">
                  <span class="spin" /> 문제를 읽는 중…
                </div>
              )}
              {problem.status === "none" && (
                <div class="card muted">이 페이지에서 문제를 찾지 못했습니다. 코드트리 문제 페이지에서 열어 주세요.</div>
              )}
              {ready && session && tab === "before" && (
                <BeforeView
                  problem={ready}
                  session={session}
                  update={update}
                  reader={reader}
                  questionsEnabled={settings.questionsEnabled}
                  llm={llm}
                  drafts={drafts}
                  setDraft={(q, t) => setDrafts((d) => ({ ...d, [q]: t }))}
                />
              )}
              {ready && session && tab === "stuck" && (
                <StuckView problem={ready} session={session} update={update} reader={reader} llm={llm} onGoAfter={() => setTab("after")} />
              )}
              {ready && session && tab === "after" && (
                <AfterView session={session} update={update} save={save} onShowRecords={() => setView("records")} onRestart={restart} />
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
