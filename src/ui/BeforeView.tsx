// 풀기 전 화면: 진행 막대, 6개 질문(통과는 접힘, 현재 질문만 큰 카드), 자유 질문창

import { useState } from "preact/hooks";
import { questionDef, type QuestionProgress } from "../core/questions";
import {
  addChat,
  addHint,
  applyGrade,
  checkFreeAsk,
  currentQ,
  nextQuestionHintLevel,
  progressCount,
  skipQuestion,
  type Session,
} from "../core/session";
import type { ProblemContext } from "../core/tasks";
import { send, type LlmStatus } from "../messages";
import type { ProblemSnapshot, SiteReader } from "../sites/types";
import { ProblemCard } from "./ProblemCard";

export interface BeforeProps {
  problem: ProblemSnapshot;
  session: Session;
  update: (f: (s: Session) => Session) => void;
  reader: SiteReader;
  questionsEnabled: boolean;
  llm: LlmStatus | null;
  drafts: Record<number, string>;
  setDraft: (q: number, text: string) => void;
}

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function context(p: ProblemSnapshot): ProblemContext {
  return { title: p.title, statement: p.statement, tex: p.tex };
}

export function BeforeView(props: BeforeProps) {
  const { problem, session, questionsEnabled, llm } = props;
  const cur = currentQ(session);
  const done = progressCount(session);
  const connected = !!llm && llm.available && llm.hasKey;

  return (
    <>
      {!connected && llm && (
        <div class="card row">
          <span class="grow small">계정을 연결하면 답을 채점받고 힌트를 받을 수 있습니다.</span>
          <button class="btn primary" onClick={() => send({ type: "open.options" })}>
            연결하기
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
              <span class="count">
                {done}/6
              </span>
            </div>
          </div>
          <div class="qlist">
            {session.questions.map((p) =>
              p.q === cur ? <CurrentCard key={p.q} {...props} progress={p} /> : <FoldedRow key={p.q} p={p} reached={cur === null || p.q < cur} />,
            )}
          </div>
          {cur === null && (
            <div class="notice good">6개 질문을 마쳤습니다. 이제 코드를 쳐 보세요. 막히면 "막혔을 때" 탭으로 오세요.</div>
          )}
        </>
      ) : (
        <div class="card muted small">6개 질문이 꺼져 있습니다. 설정에서 켤 수 있습니다.</div>
      )}
      <FreeChat {...props} />
    </>
  );
}

function FoldedRow({ p, reached }: { p: QuestionProgress; reached: boolean }) {
  const def = questionDef(p.q);
  if (!reached) {
    return (
      <div class="qrow todo">
        <span class="tag todo">{def.short}</span>
        <span class="text">{def.text}</span>
      </div>
    );
  }
  const passed = p.summary !== null;
  return (
    <div class="qrow" title={p.answer ?? undefined}>
      <span class={`tag ${passed ? "passed" : "skipped"}`}>{def.short}</span>
      <span class="text">{passed ? p.summary : "건너뜀"}</span>
    </div>
  );
}

function CurrentCard({ problem, session, update, drafts, setDraft, progress }: BeforeProps & { progress: QuestionProgress }) {
  const def = questionDef(progress.q);
  const draft = drafts[progress.q] ?? "";
  const [busy, setBusy] = useState<null | "grade" | "hint">(null);
  const [error, setError] = useState<string | null>(null);
  const hintLevel = nextQuestionHintLevel(session, progress.q);

  async function submit() {
    const answer = draft.trim();
    if (!answer || busy) return;
    setBusy("grade");
    setError(null);
    try {
      const previous = session.questions
        .filter((p) => p.q < progress.q && p.summary)
        .map((p) => ({ q: p.q, summary: p.summary! }));
      const r = await send({ type: "task.grade", input: { problem: context(problem), q: progress.q, answer, previous } });
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
        input: { problem: context(problem), q: progress.q, level: hintLevel, answer: draft.trim() || null, code: null, given: progress.hints },
      });
      update((s) => addHint(s, progress.q, r.text, hintLevel));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div class="card current" aria-label={`${def.q}번 질문`}>
      <div class="qnum">
        {def.q} / 6 · {def.short}
      </div>
      <p class="qtext">{def.text}</p>
      <textarea
        aria-label={`${def.q}번 답`}
        placeholder={def.placeholder}
        value={draft}
        onInput={(e) => setDraft(progress.q, (e.target as HTMLTextAreaElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
      />
      {progress.feedback && <div class="notice bad">{progress.feedback}</div>}
      {progress.hints.map((h, i) => (
        <div class="notice info">
          힌트 {i + 1}: {h}
        </div>
      ))}
      {error && <div class="notice bad">{error}</div>}
      <div class="row" style={{ marginTop: "12px" }}>
        <button class="btn primary grow" disabled={!draft.trim() || !!busy} onClick={submit}>
          {busy === "grade" ? <span class="spin" /> : "확인"}
        </button>
        <button class="btn" disabled={!hintLevel || !!busy} onClick={askHint} title={hintLevel ? `힌트 ${hintLevel}단계` : "이 질문의 힌트를 다 봤습니다"}>
          {busy === "hint" ? <span class="spin" /> : "힌트"}
        </button>
        <button class="btn ghost" disabled={!!busy} onClick={() => update((s) => skipQuestion(s, progress.q))}>
          건너뛰기
        </button>
      </div>
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
        input: { problem: context(problem), history: check.session.chat, message, code },
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

