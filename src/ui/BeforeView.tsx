// 풀기 전 화면: 진행 막대, 6칸(화면 순서: 입력 → 출력 → 손풀이 → 규칙 → 구조 → 경계), 자유 질문창.
// 지나간 칸은 한 줄로 접히고, 지금 칸만 큰 카드로 보인다.

import { useEffect, useRef, useState } from "preact/hooks";
import {
  DISPLAY_ORDER,
  EXAMPLE_PROBLEM,
  displayIndex,
  joinFields,
  questionDef,
  type QuestionDef,
  type QuestionProgress,
} from "../core/questions";
import {
  addChat,
  addHint,
  applyGrade,
  checkFreeAsk,
  currentQ,
  nextQuestionHintLevel,
  previousAnswers,
  progressCount,
  skipQuestion,
  type Session,
} from "../core/session";
import type { ProblemContext } from "../core/tasks";
import { send, type LlmStatus } from "../messages";
import type { ProblemSnapshot, SiteReader } from "../sites/types";
import { ProblemCard } from "./ProblemCard";
import { ConfirmButton } from "./ConfirmButton";
import { isTouched } from "../storage/records";

export interface BeforeProps {
  problem: ProblemSnapshot;
  session: Session;
  update: (f: (s: Session) => Session) => void;
  reader: SiteReader;
  questionsEnabled: boolean;
  llm: LlmStatus | null;
  /** 입력 중인 글. 큰 칸은 "q", 작은 칸은 "q:key", 구조의 됨/안 됨은 "5:verdict" */
  drafts: Record<string, string>;
  setDraft: (key: string, text: string) => void;
  onRestart: () => Promise<void>;
  /** "왜 이 칸을 쓰나요?"를 이미 본 칸 */
  whySeen: number[];
  markWhySeen: (q: number) => void;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function context(p: ProblemSnapshot): ProblemContext {
  return { title: p.title, statement: p.statement, tex: p.tex };
}

/** 구조의 횟수 칸: 숫자나 입력 이름(영문)이 있어야 됨/안 됨을 고를 수 있다 */
export const countIsFilled = (v: string | undefined) => !!v && /[0-9a-zA-Z]/.test(v);

/** 지금 입력으로 채점에 보낼 글. 아직 보낼 수 없으면 null */
export function composeAnswer(def: QuestionDef, drafts: Record<string, string>): string | null {
  if (!def.fields) {
    const t = drafts[String(def.q)]?.trim();
    return t ? t : null;
  }
  const values: Record<string, string> = {};
  for (const f of def.fields) values[f.key] = drafts[`${def.q}:${f.key}`] ?? "";
  if (def.q === 5) {
    const verdict = drafts["5:verdict"];
    if (!countIsFilled(values.count) || !verdict) return null;
    if (verdict !== "안 됨") values.reduce = "";
    if (!values.loop?.trim() && !values.out?.trim()) return null;
    return joinFields(def, values, { verdict });
  }
  if (def.q === 6 && (!values.input?.trim() || !values.answer?.trim())) return null;
  const joined = joinFields(def, values);
  return joined ? joined : null;
}

export function BeforeView(props: BeforeProps) {
  const { problem, session, questionsEnabled, llm } = props;
  const cur = currentQ(session);
  const done = progressCount(session);
  const connected = !!llm && llm.available && llm.hasKey;
  const ordered = DISPLAY_ORDER.map((q) => session.questions.find((p) => p.q === q)!).filter(Boolean);
  const rest = cur === null ? [] : ordered.filter((p) => !p.resolved && p.q !== cur);

  return (
    <>
      {!connected && llm && (
        <div class="card row">
          <span class="grow small">Claude API 키를 넣으면 답을 채점받고 힌트를 받을 수 있어요.</span>
          <button class="btn primary" onClick={() => send({ type: "open.options" })}>
            키 넣기
          </button>
        </div>
      )}
      <ProblemCard problem={problem} defaultOpen={false} />
      {questionsEnabled ? (
        <>
          <div class="card">
            <div class="progress" aria-label={`생각 정리 ${done}/6`}>
              <span class="small muted">생각 정리</span>
              <div class="bar">
                <div class="fill" style={{ width: `${(done / 6) * 100}%` }} />
              </div>
              <span class="count">{done}/6</span>
            </div>
            <p class="small muted" style={{ marginTop: "6px" }}>
              흐린 예시는 <b>다른 문제</b> '{EXAMPLE_PROBLEM}'의 답이에요.
            </p>
          </div>
          <div class="qlist">
            {ordered
              .filter((p) => p.resolved || p.q === cur)
              .map((p) => (p.q === cur ? <CurrentCard key={p.q} {...props} progress={p} /> : <FoldedRow key={p.q} p={p} />))}
            {rest.length > 0 && <div class="rest">남은 칸 · {rest.map((p) => questionDef(p.q).short).join(" · ")}</div>}
          </div>
          {cur === null && (
            <div class="notice good">6개 질문을 마쳤어요. 이제 코드를 쳐 보세요.</div>
          )}
        </>
      ) : (
        <div class="card muted small">6개 질문이 꺼져 있어요. 설정에서 켤 수 있어요.</div>
      )}
      <FreeChat {...props} />
      {isTouched(session) && (
        <div class="row end">
          <ConfirmButton
            label="처음부터 다시"
            question={
              session.result === null
                ? "지금까지 쓴 답과 대화를 지우고 처음부터 다시 할까요? 이 풀이 기록도 지워져요."
                : "끝낸 풀이 기록은 남겨 두고, 처음부터 새로 풀까요?"
            }
            confirmLabel={session.result === null ? "지우고 다시" : "새로 풀기"}
            onConfirm={props.onRestart}
          />
        </div>
      )}
    </>
  );
}

function FoldedRow({ p }: { p: QuestionProgress }) {
  const def = questionDef(p.q);
  if (p.revealed) {
    return (
      <div class="qrow" title={p.answer ?? undefined}>
        <span class="tag revealed">{def.short}</span>
        <span class="text two">공개된 답: {p.revealed}</span>
      </div>
    );
  }
  if (p.summary !== null) {
    return (
      <div class="qrow" title={p.answer ?? undefined}>
        <span class="tag passed">{def.short}</span>
        <span class="text">
          <span class="two">{p.summary}</span>
          {p.feedback && <span class="more">{p.feedback}</span>}
        </span>
      </div>
    );
  }
  return (
    <div class="qrow">
      <span class="tag skipped">{def.short}</span>
      <span class="text">건너뜀</span>
    </div>
  );
}

function CurrentCard(props: BeforeProps & { progress: QuestionProgress }) {
  const { problem, session, update, drafts, setDraft, progress, whySeen, markWhySeen } = props;
  const def = questionDef(progress.q);
  const [busy, setBusy] = useState<null | "grade" | "hint">(null);
  const [error, setError] = useState<string | null>(null);
  const [showExample, setShowExample] = useState(false);
  const [whyOpen, setWhyOpen] = useState(() => !whySeen.includes(def.q));
  const cardRef = useRef<HTMLDivElement>(null);
  const hintLevel = nextQuestionHintLevel(session, progress.q);
  const answer = composeAnswer(def, drafts);

  // 처음 보는 칸이면 "왜?"를 펼쳐 보여 주고 본 것으로 기록. 지금 칸으로 스크롤
  useEffect(() => {
    if (!whySeen.includes(def.q)) markWhySeen(def.q);
    cardRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [def.q]);
  // 이 칸에서 처음 '다시'를 받으면 "왜?"를 펼친다
  useEffect(() => {
    if (progress.attempts === 1 && progress.state === "failed") setWhyOpen(true);
  }, [progress.attempts]);

  async function submit() {
    if (!answer || busy) return;
    setBusy("grade");
    setError(null);
    try {
      const r = await send({
        type: "task.grade",
        input: {
          problem: context(problem),
          q: progress.q,
          answer,
          previous: previousAnswers(session, progress.q),
          attempt: progress.attempts + 1,
          language: session.language,
        },
      });
      update((s) => applyGrade(s, progress.q, answer, r));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  }

  async function askHint() {
    if (!hintLevel || busy) return;
    setBusy("hint");
    setError(null);
    try {
      const r = await send({
        type: "task.hint",
        input: {
          problem: context(problem),
          q: progress.q,
          level: hintLevel,
          answer: answer ?? (drafts[String(def.q)]?.trim() || null),
          code: null,
          given: progress.hints,
          language: session.language,
        },
      });
      update((s) => addHint(s, progress.q, r.text));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div class="card current" aria-label={`${def.short} 칸`} ref={cardRef}>
      <div class="qnum">
        {displayIndex(def.q)} / 6 · {def.short}
      </div>
      <p class="qtext">{def.text}</p>
      <div class="guide">
        <span>쓰는 틀: {def.guide}</span>
        <button class="linklike" aria-expanded={showExample} onClick={() => setShowExample((v) => !v)}>
          예시
        </button>
      </div>
      {showExample && (
        <div class="example">
          {def.fields ? def.fields.filter((f) => !(def.q === 5 && f.key === "reduce")).map((f) => `${f.label}: ${f.placeholder.replace(/^예: /, "")}`).join("\n") : def.example}
        </div>
      )}

      {def.fields ? (
        <FieldInputs def={def} drafts={drafts} setDraft={setDraft} onKey={onKey} />
      ) : (
        <textarea
          aria-label={`${def.short} 답`}
          placeholder={def.example}
          rows={def.q === 2 || def.q === 1 ? 4 : 3}
          value={drafts[String(def.q)] ?? ""}
          onInput={(e) => setDraft(String(def.q), (e.target as HTMLTextAreaElement).value)}
          onKeyDown={onKey}
        />
      )}

      {progress.feedback && !progress.resolved && <div class="notice bad">{progress.feedback}</div>}
      {progress.hints.map((h, i) => (
        <div class="notice info">
          힌트 {i + 1}: {h}
        </div>
      ))}
      {error && <div class="notice bad">{error}</div>}
      <details class="why" open={whyOpen} onToggle={(e) => setWhyOpen((e.target as HTMLDetailsElement).open)}>
        <summary>왜 이 칸을 쓰나요?</summary>
        <p>{def.why}</p>
      </details>
      <div class="row" style={{ marginTop: "10px" }}>
        <button class="btn primary grow" disabled={!answer || !!busy} onClick={submit}>
          {busy === "grade" ? <span class="spin" /> : "확인"}
        </button>
        <button class="btn" disabled={!hintLevel || !!busy} onClick={askHint} title={hintLevel ? `힌트 ${hintLevel}단계` : "이 칸의 힌트를 다 봤어요"}>
          {busy === "hint" ? <span class="spin" /> : "힌트"}
        </button>
        <button class="btn ghost" disabled={!!busy} onClick={() => update((s) => skipQuestion(s, progress.q))}>
          건너뛰기
        </button>
      </div>
      {progress.attempts > 0 && !progress.resolved && (
        <p class="small muted" style={{ marginTop: "6px" }}>
          남은 기회 {3 - progress.attempts}번. 세 번째도 다시면 이 칸의 답을 보여 주고 넘어가요.
        </p>
      )}
    </div>
  );
}

function FieldInputs({
  def,
  drafts,
  setDraft,
  onKey,
}: {
  def: QuestionDef;
  drafts: Record<string, string>;
  setDraft: (key: string, text: string) => void;
  onKey: (e: KeyboardEvent) => void;
}) {
  const verdict = drafts["5:verdict"];
  const countOk = countIsFilled(drafts["5:count"]);
  return (
    <div class="fields">
      {def.fields!.map((f) => {
        if (def.q === 5 && f.key === "reduce" && verdict !== "안 됨") return null;
        const key = `${def.q}:${f.key}`;
        const input = (
          <input
            type="text"
            aria-label={`${def.short} ${f.label}`}
            placeholder={f.placeholder}
            value={drafts[key] ?? ""}
            onInput={(e) => setDraft(key, (e.target as HTMLInputElement).value)}
            onKeyDown={onKey}
          />
        );
        if (def.q === 5 && f.key === "count") {
          return (
            <>
              <div class="fld">
                <span class="flabel">{f.label}</span>
                {input}
                <div class="yn" role="group" aria-label="시간 안에 되나">
                  {(["됨", "안 됨"] as const).map((v) => (
                    <button aria-pressed={verdict === v} disabled={!countOk} onClick={() => setDraft("5:verdict", v)}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              {!countOk && <p class="tiny">횟수부터 적어 주세요 (숫자나 입력 이름으로)</p>}
            </>
          );
        }
        return (
          <div class="fld">
            <span class="flabel">{f.label}</span>
            {input}
          </div>
        );
      })}
    </div>
  );
}

function FreeChat({ problem, session, update, reader }: BeforeProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "info" | "bad"; text: string } | null>(null);

  async function ask() {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const { code } = await reader.readCode();
      const check = checkFreeAsk(session, code);
      update(() => check.session);
      if (!check.ok) {
        setNotice({ kind: "info", text: check.nudge });
        return;
      }
      const r = await send({
        type: "task.chat",
        input: { problem: context(problem), history: check.session.chat, message, code, language: session.language },
      });
      update((s) => addChat(s, message, r.text));
      setText("");
    } catch (e) {
      setNotice({ kind: "bad", text: errText(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="card chat">
      <h3>자유 질문</h3>
      {session.chat.map((t) => (
        <div class={`bubble ${t.role === "user" ? "me" : "ai"}`}>{t.content}</div>
      ))}
      {notice && <div class={`notice ${notice.kind}`}>{notice.text}</div>}
      <div class="chat-input">
        <textarea
          aria-label="자유 질문"
          placeholder="궁금한 것을 물어보세요"
          value={text}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
              e.preventDefault();
              ask();
            }
          }}
        />
        <button class="btn primary" disabled={!text.trim() || busy} onClick={ask}>
          {busy ? <span class="spin" /> : "보내기"}
        </button>
      </div>
    </div>
  );
}
