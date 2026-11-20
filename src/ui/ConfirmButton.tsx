// 되돌릴 수 없는 일(지우기, 처음부터 다시)은 한 번 더 묻는다. 창(alert)을 띄우지 않고 서랍 안에서 묻는다.

import { useState } from "preact/hooks";

export function ConfirmButton({
  label,
  question,
  confirmLabel,
  onConfirm,
  small = false,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  small?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!asking) {
    return (
      <button class={`btn ghost${small ? " small-btn" : ""}`} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <div class="confirm" role="alertdialog" aria-label={question}>
      <p>{question}</p>
      {error && <div class="notice bad">{error}</div>}
      <div class="row">
        <button
          class="btn danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onConfirm();
              setAsking(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <span class="spin" /> : confirmLabel}
        </button>
        <button class="btn" disabled={busy} onClick={() => setAsking(false)}>
          취소
        </button>
      </div>
    </div>
  );
}
