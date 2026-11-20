// 서랍 스타일. Shadow DOM 안에만 들어가므로 페이지와 섞이지 않는다. 값은 지시서 7번 표.

export const CSS = /* css */ `
:host { all: initial; }
* { box-sizing: border-box; }

.root {
  --bg: linear-gradient(180deg, #F8FBF9, #ECEFEE);
  --text: #1F2421; --text-2: #3A423E; --text-3: #5C6661;
  --card-shadow: 0 1px 2px rgba(17,17,17,.05), 0 8px 24px rgba(17,17,17,.07);
  --card-shadow-deep: 0 1px 2px rgba(17,17,17,.05), 0 12px 32px rgba(17,17,17,.10);
  --green: linear-gradient(135deg, #34825A, #2A6E48);
  --green-text: #12733A; --green-pale: #E3F1E9; --green-on-pale: #23643F;
  --dark: linear-gradient(160deg, #2B302D, #0E0F0F); --dark-text: #E8ECEA;
  --bad: #B5483F; --bad-pale: #FBECEA; --bad-on-pale: #A0392F;
  --info-pale: #E4ECFA; --info-text: #2C4FA3;
  --groove: #E1E5E3;
  --input-bg: #F8FBF9; --input-border: #D5DAD7;
  --sans: 'CSA Plex Sans KR', 'IBM Plex Sans KR', system-ui, sans-serif;
  --mono: 'CSA Plex Mono', 'IBM Plex Mono', ui-monospace, monospace;
  font-family: var(--sans); font-size: 14px; line-height: 1.55; color: var(--text);
  -webkit-font-smoothing: antialiased;
}

button { font: inherit; color: inherit; cursor: pointer; }
button:focus-visible, textarea:focus-visible, input:focus-visible, select:focus-visible {
  outline: 2px solid #2A6E48; outline-offset: 2px;
}

/* ---------- 손잡이 ---------- */
.handle {
  position: fixed; top: 50%; transform: translateY(-50%); z-index: 2147483000;
  width: 28px; height: 64px; border: 0; padding: 0;
  background: var(--green); color: #fff; font-size: 18px; font-weight: 600;
  box-shadow: 0 4px 14px rgba(17,17,17,.18);
  display: flex; align-items: center; justify-content: center;
}
.handle.right { right: 0; border-radius: 12px 0 0 12px; }
.handle.left { left: 0; border-radius: 0 12px 12px 0; }
.handle:hover { width: 32px; }

/* ---------- 서랍 ---------- */
.drawer {
  position: fixed; top: 0; bottom: 0; z-index: 2147483001;
  width: 420px; max-width: 100vw; background: var(--bg);
  display: flex; flex-direction: column;
  transition: transform .2s ease, box-shadow .2s ease;
}
.drawer.right { right: 0; transform: translateX(100%); }
.drawer.left { left: 0; transform: translateX(-100%); }
.drawer.open { transform: none; }
.drawer.right.open { box-shadow: -12px 0 32px rgba(17,17,17,.14); }
.drawer.left.open { box-shadow: 12px 0 32px rgba(17,17,17,.14); }
@media (prefers-reduced-motion: reduce) { .drawer { transition: none; } }

.head { display: flex; align-items: center; gap: 8px; padding: 14px 12px 10px 18px; }
.head .titles { flex: 1; min-width: 0; }
.head h1 { margin: 0; font-size: 17px; font-weight: 600; line-height: 1.35; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.head .sub { font-size: 12px; color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.icon-btn {
  width: 44px; height: 44px; flex: none; border: 0; border-radius: 12px; background: transparent;
  display: inline-flex; align-items: center; justify-content: center; color: var(--text-2);
}
.icon-btn:hover { background: rgba(17,17,17,.05); }
.icon-btn svg { width: 20px; height: 20px; }

.body { flex: 1; overflow-y: auto; padding: 4px 18px 18px; display: flex; flex-direction: column; gap: 12px; }

/* 탭 줄 (눌린 홈) */
.tabs {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; margin: 0 18px 10px;
  padding: 4px; border-radius: 14px; background: var(--groove);
  box-shadow: inset 0 1px 3px rgba(17,17,17,.12);
}
.tabs button {
  min-height: 40px; border: 0; border-radius: 10px; background: transparent; color: var(--text-3); font-weight: 600; font-size: 13px;
}
.tabs button[aria-selected="true"] { background: #fff; color: var(--text); box-shadow: 0 1px 2px rgba(17,17,17,.08); }

/* ---------- 카드 ---------- */
.card { background: #fff; border-radius: 16px; box-shadow: var(--card-shadow); padding: 14px 16px; }
.card.current { box-shadow: var(--card-shadow-deep); padding: 18px; }
.card h2 { margin: 0 0 6px; font-size: 15px; font-weight: 600; }
.card h3 { margin: 0 0 4px; font-size: 13px; font-weight: 600; color: var(--text-2); }
.muted { color: var(--text-3); font-size: 13px; }
.small { font-size: 12px; }
p { margin: 0; }

details.problem summary { cursor: pointer; font-weight: 600; min-height: 28px; list-style: none; display: flex; align-items: center; justify-content: space-between; }
details.problem summary::-webkit-details-marker { display: none; }
details.problem summary::after { content: '펼치기'; font-weight: 400; font-size: 12px; color: var(--text-3); }
details.problem[open] summary::after { content: '접기'; }
.statement { margin-top: 8px; white-space: pre-wrap; font-size: 13px; color: var(--text-2); max-height: 320px; overflow-y: auto; }

/* ---------- 버튼 ---------- */
.btn {
  min-height: 44px; padding: 0 16px; border-radius: 12px; border: 0; font-weight: 600;
  background: #fff; color: var(--text); box-shadow: 0 0 0 1px var(--input-border) inset;
}
.btn:hover { background: #F3F6F4; }
.btn.primary { background: var(--green); color: #fff; box-shadow: none; }
.btn.primary:hover { filter: brightness(1.06); }
.btn.ghost { background: transparent; box-shadow: none; color: var(--text-2); }
.btn.ghost:hover { background: rgba(17,17,17,.05); }
.btn:disabled { opacity: .5; cursor: default; }
.btn.danger { background: var(--bad); color: #fff; box-shadow: none; }
.btn.danger:hover { filter: brightness(1.06); }
.btn.small-btn { min-height: 36px; padding: 0 10px; font-size: 12px; color: var(--text-3); }
.confirm { background: var(--bad-pale); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 10px; width: 100%; }
.confirm p { color: var(--bad-on-pale); font-size: 13px; }
.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.row.end { justify-content: flex-end; }
.grow { flex: 1; }

/* ---------- 입력창 ---------- */
textarea, input[type="text"], input[type="password"], select {
  width: 100%; font: inherit; color: var(--text); background: var(--input-bg);
  border: 1px solid var(--input-border); border-radius: 10px; padding: 10px 12px;
}
textarea { resize: vertical; min-height: 72px; }

/* ---------- 진행 막대 ---------- */
.progress { display: flex; align-items: center; gap: 10px; }
.progress .bar { flex: 1; height: 8px; border-radius: 99px; background: var(--groove); overflow: hidden; }
.progress .fill { height: 100%; background: var(--green); border-radius: 99px; transition: width .2s; }
.progress .count { font-size: 13px; font-weight: 600; color: var(--text-2); min-width: 32px; text-align: right; }

/* ---------- 질문 ---------- */
.qlist { display: flex; flex-direction: column; gap: 8px; }
.qrow { display: flex; align-items: center; gap: 10px; background: #fff; border-radius: 14px; box-shadow: var(--card-shadow); padding: 10px 14px; min-height: 44px; }
.qrow .tag { flex: none; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 99px; }
.qrow .tag.passed { background: var(--green); color: #fff; }
.qrow .tag.skipped { background: var(--groove); color: var(--text-3); }
.qrow .tag.todo { background: transparent; color: var(--text-3); box-shadow: 0 0 0 1px var(--input-border) inset; }
.qrow .text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: var(--text-2); }
.qrow.todo { box-shadow: none; background: transparent; opacity: .75; }
.qrow .tag.revealed { background: var(--bad-pale); color: var(--bad-on-pale); }
.qrow .text .two, .qrow .text.two { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.qrow .text .more { display: block; white-space: normal; font-size: 12px; color: var(--green-on-pale); margin-top: 2px; }
.qrow .text:has(.two), .qrow .text.two { white-space: normal; }
.rest { font-size: 12px; color: var(--text-3); padding: 4px 6px; }
.guide { display: flex; gap: 8px; align-items: flex-start; font-size: 12px; color: var(--text-3); margin: -6px 0 8px; }
.guide span { flex: 1; }
.linklike { border: 0; background: none; padding: 0 2px; color: var(--green-text); text-decoration: underline; font-size: 12px; flex: none; min-height: 20px; }
.example { white-space: pre-wrap; font-size: 12px; color: var(--text-3); background: var(--input-bg); border: 1px dashed var(--input-border); border-radius: 8px; padding: 6px 10px; margin-bottom: 8px; }
textarea::placeholder, input::placeholder { color: #9AA39E; }
.fields { display: flex; flex-direction: column; gap: 4px; }
.fld { display: flex; align-items: center; gap: 8px; min-height: 44px; }
.flabel { width: 44px; flex: none; font-size: 12px; font-weight: 600; color: var(--text-2); }
.fld input { flex: 1; min-width: 0; height: 38px; padding: 0 10px; font-size: 13px; }
.yn { display: flex; gap: 4px; flex: none; }
.yn button { height: 38px; min-width: 44px; padding: 0 10px; border-radius: 9px; border: 1px solid var(--input-border); background: #fff; font-size: 12px; font-weight: 600; }
.yn button[aria-pressed="true"] { background: var(--green); color: #fff; border-color: transparent; }
.yn button:disabled { opacity: .45; cursor: default; }
.tiny { font-size: 11px; color: var(--bad-on-pale); margin: -2px 0 4px 52px; }
.why { margin-top: 8px; font-size: 12px; color: var(--text-3); }
.why summary { cursor: pointer; color: var(--text-2); min-height: 24px; }
.why p { margin-top: 4px; background: var(--info-pale); color: var(--info-text); border-radius: 8px; padding: 6px 10px; }
.qnum { font-size: 12px; font-weight: 600; color: var(--green-text); }
.qtext { font-size: 16px; font-weight: 600; margin: 2px 0 10px; }
.notice { border-radius: 10px; padding: 8px 12px; font-size: 13px; margin-top: 10px; white-space: pre-wrap; }
.notice.bad { background: var(--bad-pale); color: var(--bad-on-pale); }
.notice.info { background: var(--info-pale); color: var(--info-text); }
.notice.good { background: var(--green-pale); color: var(--green-on-pale); }

/* ---------- 자유 질문 ---------- */
.chat { display: flex; flex-direction: column; gap: 8px; }
.bubble { border-radius: 12px; padding: 8px 12px; font-size: 13px; white-space: pre-wrap; max-width: 92%; }
.bubble.me { align-self: flex-end; background: var(--green-pale); color: var(--green-on-pale); }
.bubble.ai { align-self: flex-start; background: #fff; box-shadow: var(--card-shadow); }
.chat-input { display: flex; gap: 8px; align-items: flex-end; }
.chat-input textarea { min-height: 44px; height: 44px; }

/* ---------- 6칸 ---------- */
.cells { display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; }
.cell { border-radius: 8px; padding: 6px 2px; text-align: center; font-size: 11px; font-weight: 600; }
.cell.passed { background: var(--green); color: #fff; }
.cell.failed { background: var(--bad); color: #fff; }
.cell.skipped { background: var(--groove); color: var(--text-3); }
.cell.not_reached { background: transparent; color: var(--text-3); box-shadow: 0 0 0 1px var(--input-border) inset; }

/* ---------- 설정 ---------- */
.field { display: flex; flex-direction: column; gap: 8px; }
.option { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 4px; border-radius: 10px; }
.option input { width: 18px; height: 18px; accent-color: #2A6E48; }
.option.disabled { color: var(--text-3); }
.seg { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 12px; background: var(--groove); box-shadow: inset 0 1px 3px rgba(17,17,17,.12); }
.seg button { min-height: 40px; border: 0; border-radius: 9px; background: transparent; font-weight: 600; color: var(--text-3); }
.seg button[aria-pressed="true"] { background: #fff; color: var(--text); box-shadow: 0 1px 2px rgba(17,17,17,.08); }
.status { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-3); }
.dot.on { background: #2A6E48; }
.kbd { font-family: var(--mono); font-size: 12px; background: var(--groove); border-radius: 6px; padding: 2px 6px; }

/* ---------- 내 기록 ---------- */
.rec { display: flex; flex-direction: column; gap: 6px; }
.rec .meta { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--text-3); }
.badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 99px; }
.badge.passed { background: var(--green-pale); color: var(--green-on-pale); }
.badge.gave_up { background: var(--bad-pale); color: var(--bad-on-pale); }
.badge.ongoing { background: var(--info-pale); color: var(--info-text); }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.stat { background: #fff; border-radius: 14px; box-shadow: var(--card-shadow); padding: 10px 12px; }
.stat b { display: block; font-size: 20px; }
.stat span { font-size: 12px; color: var(--text-3); }

.dark { background: var(--dark); color: var(--dark-text); border-radius: 12px; padding: 10px 12px; font-family: var(--mono); font-size: 12px; white-space: pre-wrap; }
.spin { display: inline-block; width: 14px; height: 14px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin .7s linear infinite; vertical-align: -2px; }
@keyframes spin { to { transform: rotate(360deg); } }
.toast { position: absolute; left: 18px; right: 18px; bottom: 18px; background: var(--dark); color: var(--dark-text); padding: 10px 14px; border-radius: 12px; font-size: 13px; }
`;
