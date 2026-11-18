// 막혔을 때 화면: 실행 결과(오류 / 나의 출력과 정답 나란히 / 통과), 힌트 사다리, 코드 리뷰 3항목, 자유 질문창

import { useState } from "preact/hooks";
import { addHint, nextLadderLevel, setReview, showRun, type Session, type ShownRun } from "../core/session";
import { describeMismatch, diffLines } from "../core/runs";
import { REVIEW_LABELS } from "../core/tasks";
import { send, type LlmStatus } from "../messages";
import type { ProblemSnapshot, SiteReader } from "../sites/types";
import { ConnectNotice, FreeChat, context, errText } from "./BeforeView";

export interface StuckProps {
  problem: ProblemSnapshot;
  session: Session;
  update: (f: (s: Session) => Session) => void;
  reader: SiteReader;
  llm: LlmStatus | null;
  onGoAfter: () => void;
}

export const LADDER = [
  { level: 1, name: "질문", desc: "스스로 알아차리게 하는 질문" },
  { level: 2, name: "방향", desc: "어느 쪽으로 생각하면 되는지" },
  { level: 3, name: "코드 한 줄", desc: "핵심이 되는 코드 한 줄" },
  { level: 4, name: "정답", desc: "풀이 전체 (기록에 남습니다)" },
] as const;

export function StuckView(props: StuckProps) {
  return (
    <>
      <ConnectNotice llm={props.llm} />
      <RunCard {...props} />
      <HintLadder {...props} />
      <ReviewCard {...props} />
      <FreeChat {...props} run={props.session.lastRun?.result ?? null} />
    </>
  );
}

// ---------- 실행 결과 ----------

function RunCard({ session, update, reader, onGoAfter }: StuckProps) {
  const [msg, setMsg] = useState<string | null>(null);
  const run = session.lastRun?.result ?? null;
  const { total, errors, mismatches } = session.runs;

  const reread = () => {
    const r = reader.readRunResult();
    if (r.kind === "none") return setMsg("화면에서 실행 결과를 찾지 못했습니다. 코드트리에서 '코드 실행'을 눌러 보세요.");
    setMsg(null);
    update((s) => showRun(s, r));
  };

  return (
    <div class="card run" aria-label="실행 결과">
      <div class="run-head">
        <h2>실행 결과</h2>
        <span class="small muted" aria-label="실행 횟수">
          실행 {total}번 · 오류 {errors} · 출력 다름 {mismatches}
        </span>
      </div>
      {!run && <p class="small muted">아직 실행 결과가 없습니다. 코드트리에서 '코드 실행'을 누르면 여기에 나옵니다.</p>}
      {run && <RunBody run={run} onGoAfter={onGoAfter} />}
      {msg && <div class="notice info">{msg}</div>}
      <div class="row end" style={{ marginTop: "8px" }}>
        <button class="btn ghost" onClick={reread} title="화면에 떠 있는 실행 결과를 다시 읽습니다 (횟수는 세지 않음)">
          화면에서 다시 읽기
        </button>
      </div>
    </div>
  );
}

function RunBody({ run, onGoAfter }: { run: ShownRun; onGoAfter: () => void }) {
  if (run.kind === "error") {
    return (
      <>
        <span class="badge gave_up">오류</span>
        <pre class="dark out" aria-label="오류 메시지">
          {run.message}
        </pre>
        <p class="small muted">맨 아래 줄이 오류 종류와 이유입니다. 몇 번째 줄에서 났는지 먼저 보세요.</p>
      </>
    );
  }
  if (run.kind === "mismatch") {
    const d = diffLines(run.mine, run.expected);
    return (
      <>
        <span class="badge gave_up">출력이 다름</span>
        <div class="compare">
          <OutputBlock label="나의 출력" text={run.mine} marks={d.mine} />
          <OutputBlock label="정답" text={run.expected} marks={d.expected} />
        </div>
        <p class="small diff-note">{describeMismatch(d)}</p>
      </>
    );
  }
  return (
    <>
      <div class="notice good">
        예제를 통과했습니다{run.time ? ` (${[run.time, run.memory].filter(Boolean).join(" · ")})` : ""}. 제출해서 통과하면 '풀고 난 뒤'에서 마무리하세요.
      </div>
      <div class="row" style={{ marginTop: "8px" }}>
        <button class="btn" onClick={onGoAfter}>
          풀고 난 뒤로
        </button>
      </div>
    </>
  );
}

function OutputBlock({ label, text, marks }: { label: string; text: string; marks: boolean[] }) {
  return (
    <div class="out-col">
      <h3>{label}</h3>
      <pre class="dark out" aria-label={label}>
        {text.split("\n").map((line, i) => (
          <span class={`ln${marks[i] ? " diff" : ""}`}>{line || " "}</span>
        ))}
      </pre>
    </div>
  );
}

// ---------- 힌트 사다리 ----------

function HintLadder({ problem, session, update, reader }: StuckProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const next = nextLadderLevel(session);

  async function open(level: 1 | 2 | 3 | 4) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setConfirming(false);
    try {
      const { code } = await reader.readCode();
      const r = await send({
        type: "task.hint",
        input: { problem: context(problem), q: null, level, answer: null, code, given: session.ladder, run: session.lastRun?.result ?? null },
      });
      update((s) => addHint(s, null, r.text, level));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="card" aria-label="힌트 사다리">
      <h2>힌트 사다리</h2>
      <p class="small muted">한 단계씩 엽니다. 지금 코드와 실행 결과를 보고 만듭니다.</p>
      <ol class="ladder">
        {LADDER.map((step) => {
          const text = session.ladder[step.level - 1];
          const state = text !== undefined ? "open" : step.level === next ? "next" : "locked";
          return (
            <li class={`step ${state}`}>
              <div class="step-head">
                <span class="step-num">{step.level}</span>
                <b>{step.name}</b>
                {state !== "open" && <span class="small muted">{step.desc}</span>}
              </div>
              {text !== undefined && (
                <div class="step-body">
                  <RichText text={text} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {error && <div class="notice bad">{error}</div>}
      {confirming && next === 4 && (
        <div class="notice bad">
          정답을 보면 이 풀이 기록에 '정답 봄'으로 남습니다. 그래도 볼까요?
          <div class="row" style={{ marginTop: "8px" }}>
            <button class="btn" onClick={() => open(4)}>
              정답 볼게요
            </button>
            <button class="btn ghost" onClick={() => setConfirming(false)}>
              취소
            </button>
          </div>
        </div>
      )}
      {next !== null && !confirming && (
        <div class="row" style={{ marginTop: "10px" }}>
          <button class="btn grow" disabled={busy} onClick={() => (next === 4 ? setConfirming(true) : open(next))}>
            {busy ? <span class="spin" /> : next === 4 ? "정답 보기" : `힌트 ${next}단계 열기`}
          </button>
        </div>
      )}
    </div>
  );
}

/** 글 사이의 ``` 코드 블록만 어두운 블록으로 그린다 */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/```[\w+-]*\n?([\s\S]*?)(?:```|$)/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <pre class="dark code">{p.replace(/\n$/, "")}</pre>
        ) : (
          p.trim() && <p class="rich">{p.trim()}</p>
        ),
      )}
    </>
  );
}

// ---------- 코드 리뷰 ----------

function ReviewCard({ problem, session, update, reader }: StuckProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rv = session.review;

  async function ask() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { code, language } = await reader.readCode();
      if (!code?.trim()) throw new Error("에디터의 코드를 읽지 못했습니다. 코드를 쓴 뒤 다시 눌러 주세요.");
      const items = await send({
        type: "task.review",
        input: { problem: context(problem), code, language, run: session.lastRun?.result ?? null },
      });
      update((s) => setReview(s, items, code));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="card" aria-label="코드 리뷰">
      <h2>코드 리뷰</h2>
      {!rv && <p class="small muted">지금 에디터의 코드를 세 가지로 봅니다: 맞는가, 읽기 쉬운가, 더 단순한 길이 있는가.</p>}
      {rv && (
        <ul class="review">
          {(Object.keys(REVIEW_LABELS) as (keyof typeof REVIEW_LABELS)[]).map((k) => (
            <li>
              <div class="review-head">
                <b>{REVIEW_LABELS[k]}</b>
                <span class={`badge ${rv.items[k].ok ? "passed" : "gave_up"}`}>{rv.items[k].ok ? "좋아요" : "살펴보기"}</span>
              </div>
              <p class="small">{rv.items[k].comment}</p>
            </li>
          ))}
        </ul>
      )}
      {error && <div class="notice bad">{error}</div>}
      <div class="row" style={{ marginTop: "10px" }}>
        <button class="btn grow" disabled={busy} onClick={ask}>
          {busy ? <span class="spin" /> : rv ? "지금 코드로 다시 받기" : "코드 리뷰 받기"}
        </button>
      </div>
    </div>
  );
}
