// 서랍 전체. 화면: 접힌 손잡이 / 풀기 전 / 막혔을 때 / 풀고 난 뒤 / 설정

import { useEffect, useRef, useState } from "preact/hooks";
import type { ProblemSnapshot, SiteReader } from "../sites/types";
import type { Settings } from "../storage/settings";
import { newSession, type Session } from "../core/session";
import { isTouched, nextStartTime, recordId } from "../storage/records";
import { send } from "../messages";
import { IconBack, IconClose, IconGear } from "./icons";
import { SettingsView, useLlmStatus } from "./SettingsView";
import { BeforeView } from "./BeforeView";
import { AfterView, type SaveState } from "./AfterView";
import { CopyButton, RecordsView } from "./RecordsView";

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
/** 이 문제의 기존 기록과 id가 겹치지 않는 시작 시각으로 새 풀이를 만든다 */
async function freshSession(problem: ProblemSnapshot, reader: SiteReader): Promise<Session> {
  const records = await send({ type: "records.list" }).catch(() => []);
  const start = nextStartTime(records.filter((r) => r.problemId === problem.problemId).map((r) => r.startedAt));
  const { language } = await reader.readCode();
  return newSession({ problemId: problem.problemId, title: problem.title, language }, start);
}

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
      if (saved) return setSession(saved);
      const fresh = await freshSession(problem, reader);
      if (alive) setSession(fresh);
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

  /**
   * 처음부터 다시. 진행 중인 풀이는 기록을 지우고 새로 시작한다. 끝낸 풀이는 기록을 남기고 새 기록으로 시작한다.
   * 시작 시각은 freshSession이 기존 기록과 id가 겹치지 않게 정한다.
   */
  const restart = async () => {
    if (!problem || !session) return;
    clearTimeout(timer.current); // 아직 안 보낸 자동 저장이 지운 기록을 되살리지 않게
    if (session.result === null) await send({ type: "session.discard", problemId: session.problemId, startedAt: session.startedAt });
    const fresh = await freshSession(problem, reader);
    setSave({ status: "idle" });
    setSession(fresh);
  };

  /** 내 기록에서 지금 풀이의 기록이 지워졌으면, 저장하지 않고 새 풀이로 바꾼다 */
  const forget = async (deletedId: string | "all") => {
    if (!problem || !session) return;
    if (deletedId !== "all" && deletedId !== recordId(session)) return;
    clearTimeout(timer.current);
    const fresh = await freshSession(problem, reader);
    setSave({ status: "idle" });
    setSession(fresh);
  };

  return { session: session?.problemId === problem?.problemId ? session : null, update, save, restart, forget };
}

export function App({ reader, open, setOpen, settings, pageKey }: AppProps) {
  const [problem, setProblem] = useState<ProblemState>({ status: "loading" });
  const [tab, setTab] = useState<Tab>("before");
  const [view, setView] = useState<"main" | "settings" | "records">("main");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const ready = problem.status === "ready" ? problem.problem : null;
  const { session, update, save, restart, forget } = useSession(ready, reader);
  const restartAndClear = async () => {
    await restart();
    setDrafts({});
    setTab("before");
  };
  // 서랍을 열 때마다 연결 상태를 새로 읽는다 (설정 페이지에서 키를 넣고 돌아온 경우)
  const [llm] = useLlmStatus([open, settings.provider, settings.model]);

  useEffect(() => {
    let alive = true;
    setProblem({ status: "loading" });
    setDrafts({});
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
            {view === "main" && ready?.difficulty && <div class="sub">{ready.difficulty}</div>}
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
                <p class="small muted">풀이 기록은 이 브라우저 안에 자동으로 저장돼요. 밖으로 보내지 않아요.</p>
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
            <RecordsView onDeleted={forget} />
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
                <button role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                  {label}
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
                <div class="card muted">이 페이지에서 문제를 찾지 못했어요. 코드트리 문제 페이지에서 열어 주세요.</div>
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
                  setDraft={(k, t) => setDrafts((d) => ({ ...d, [k]: t }))}
                  onRestart={restartAndClear}
                  whySeen={settings.whySeen}
                  markWhySeen={(q) => {
                    if (!settings.whySeen.includes(q)) send({ type: "settings.set", patch: { whySeen: [...settings.whySeen, q] } }).catch(() => {});
                  }}
                />
              )}
              {ready && tab === "stuck" && (
                <div class="card muted">코드를 실행했는데 막히면, 여기서 나의 출력과 정답을 나란히 보며 고칠 수 있게 할 예정이에요. (준비 중)</div>
              )}
              {ready && session && tab === "after" && (
                <AfterView session={session} update={update} save={save} onShowRecords={() => setView("records")} onRestart={restartAndClear} />
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
