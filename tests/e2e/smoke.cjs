// 브라우저 확인용 스모크 테스트 (자동 테스트에는 포함하지 않음).
// 가짜 코드트리 페이지(mock-page.html)에 확장을 싣고 손잡이·서랍을 눌러 본다. 실제 코드트리에는 접속하지 않는다.
// 실행: npm run build && node tests/e2e/smoke.cjs   (playwright가 설치돼 있어야 한다)
const { chromium } = require("playwright");
const path = require("node:path");
const fs = require("node:fs");

const ext = path.resolve(__dirname, "../../dist");
const html = fs.readFileSync(path.join(__dirname, "mock-page.html"), "utf8");
const PROBLEM_URL = "https://www.codetree.ai/ko/trails/complete/curated-cards/intro-compare-two-grids/description";
const shotDir = process.env.SHOT_DIR || null;

// 가짜 Claude 응답: 요청 모양을 보고 채점/힌트/대화/연결 확인을 구분한다
function fakeReply(body) {
  const sys = String(body.system || "");
  const user = String(body.messages?.[body.messages.length - 1]?.content || "");
  if (body.output_config?.format) {
    const ans = (user.match(/<student_answer>\n([\s\S]*?)\n<\/student_answer>/) || [])[1] || "";
    const last = user.includes("(마지막)");
    if (ans.includes("모름"))
      return JSON.stringify({ verdict: "retry", summary: "", feedback: "한 줄에 몇 개를 찍나요?", modelAnswer: last ? "n줄 / 0 또는 1을 m개 / 공백 구분" : "" });
    if (ans.includes("보완")) return JSON.stringify({ verdict: "partial", summary: "작은 입력으로 풀었음", feedback: "하나만 더: 과정도 적어 보세요", modelAnswer: "" });
    return JSON.stringify({ verdict: "pass", summary: `요약: ${ans.replace(/\n/g, " ").slice(0, 20)}`, feedback: "", modelAnswer: "" });
  }
  if (sys.includes("힌트")) return "같은 위치는 어떻게 찾을까요?\n```python\nfor i in range(n):\n    pass\n```";
  if (sys.includes("자유 질문")) return "가짜 답변입니다.";
  return "확인";
}

(async () => {
  const ctx = await chromium.launchPersistentContext("", {
    headless: true,
    channel: "chromium",
    viewport: { width: 1280, height: 800 },
    permissions: ["clipboard-read", "clipboard-write"],
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  await ctx.route("https://www.codetree.ai/**", (r) => r.fulfill({ contentType: "text/html", body: html }));
  // Claude API는 가짜 응답으로 대신한다 (실제 키로 호출하지 않음)
  const apiCalls = [];
  await ctx.route("https://api.anthropic.com/**", async (r) => {
    const body = JSON.parse(r.request().postData() || "{}");
    apiCalls.push(body);
    const reply = fakeReply(body);
    await r.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ id: "msg_fake", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: reply }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }),
    });
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker");
  const page = await ctx.newPage();
  await page.goto(PROBLEM_URL);
  const results = [];
  const check = (name, ok) => results.push(`${ok ? "OK  " : "FAIL"} ${name}`);

  const handle = page.locator("#codetree-study-agent-root .handle");
  await handle.waitFor({ timeout: 10000 });
  const box = await handle.boundingBox();
  check("손잡이 28x64, 오른쪽 가장자리", box && Math.round(box.width) === 28 && Math.round(box.height) === 64 && Math.round(box.x + box.width) === 1280);
  const runBefore = await page.locator("#run").boundingBox();

  await handle.click();
  const drawer = page.locator("#codetree-study-agent-root .drawer.open");
  await drawer.waitFor({ timeout: 5000 });
  await page.waitForTimeout(400);
  const dbox = await drawer.boundingBox();
  check("서랍 폭 420px", dbox && Math.round(dbox.width) === 420);
  await page.locator("#codetree-study-agent-root .statement").waitFor({ state: "attached" });
  check("제목이 서랍에 보인다", (await page.locator("#codetree-study-agent-root h1").innerText()) === "두 개의 격자 비교하기");
  const st = await page.locator("#codetree-study-agent-root .statement").textContent();
  check("본문이 서랍에 보인다", st.includes("입력 형식") && st.includes("1 ≤ n, m ≤ 100") && !st.includes("map(int"));
  const runAfter = await page.locator("#run").boundingBox();
  check("페이지 폭/버튼 위치가 그대로", JSON.stringify(runBefore) === JSON.stringify(runAfter));
  if (shotDir) await page.screenshot({ path: path.join(shotDir, "m1-open.png") });

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check("Esc로 닫힌다", (await page.locator("#codetree-study-agent-root .drawer.open").count()) === 0);

  await handle.click();
  await drawer.waitFor();
  await page.waitForTimeout(300);
  await page.mouse.click(200, 400);
  await page.waitForTimeout(300);
  check("바깥 클릭으로 닫힌다", (await page.locator("#codetree-study-agent-root .drawer.open").count()) === 0);

  // 툴바 아이콘 클릭과 같은 효과: handleHidden 토글
  await sw.evaluate(() => chrome.storage.local.set({ settings: { handleHidden: true } }));
  await page.waitForTimeout(300);
  check("손잡이 숨기기", (await page.locator("#codetree-study-agent-root .handle").count()) === 0);
  await sw.evaluate(() => chrome.storage.local.set({ settings: { handleHidden: false } }));
  await page.waitForTimeout(300);
  check("손잡이 다시 보이기", (await page.locator("#codetree-study-agent-root .handle").count()) === 1);

  // ---------- M2: 설정 ----------
  const extId = sw.url().split("/")[2];
  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${extId}/options.html`);
  await opt.getByText("키가 아직 없어요").waitFor({ timeout: 5000 });
  check("설정 페이지: 키 없음 표시", true);
  // 사용자 보고 재현: 키 저장 전에 "연결 확인" → 오류. 저장하면 오류가 지워지고 바로 확인돼야 한다
  await opt.getByRole("button", { name: "연결 확인" }).click();
  await opt.getByText("Claude API 키가 아직 없어요", { exact: false }).waitFor({ timeout: 5000 });
  await opt.locator('input[type="password"]').fill("sk-ant-fake-key");
  await opt.getByRole("button", { name: "저장" }).click();
  await opt.getByText(/연결됐어요. Claude Opus 5.5가 응답했어요/).waitFor({ timeout: 10000 });
  check("저장하면 이전 오류가 지워지고 바로 연결 확인", (await opt.getByText("Claude API 키가 아직 없어요", { exact: false }).count()) === 0 && (await opt.getByText("연결됨 · Claude Opus 5.5").count()) === 1);
  await opt.getByRole("button", { name: "연결 확인" }).click();
  await opt.getByText(/연결됐어요. Claude Opus 5.5가 응답했어요/).waitFor({ timeout: 10000 });
  check("연결 확인: 가짜 API 응답을 받는다", apiCalls.length === 2 && apiCalls.every((c) => c.model === "claude-opus-5-5"));
  const stored = await sw.evaluate(() => chrome.storage.local.get(null));
  check("키는 secrets 칸에만 저장된다", stored.secrets?.["claude-api"] === "sk-ant-fake-key" && !JSON.stringify(stored.settings || {}).includes("sk-ant"));
  if (shotDir) await opt.screenshot({ path: path.join(shotDir, "m2-options.png") });
  await opt.close();

  await page.bringToFront();
  await handle.click();
  await drawer.waitFor();
  await page.locator('#codetree-study-agent-root button[aria-label="설정"]').click();
  await page.locator("#codetree-study-agent-root").getByText("연결됨 · Claude Opus 5.5").waitFor({ timeout: 5000 });
  check("서랍 설정 화면: 연결 상태", true);
  check("서랍 DOM에 키가 없다", !(await page.locator("#codetree-study-agent-root .drawer").innerHTML()).includes("sk-ant-fake"));
  await page.locator("#codetree-study-agent-root").getByRole("button", { name: "왼쪽" }).click();
  await page.waitForTimeout(400);
  const lbox = await page.locator("#codetree-study-agent-root .drawer.open").boundingBox();
  check("서랍 위치 왼쪽으로 바꾸기", lbox && Math.round(lbox.x) === 0);
  if (shotDir) await page.screenshot({ path: path.join(shotDir, "m2-settings.png") });
  await page.locator("#codetree-study-agent-root").getByRole("button", { name: "오른쪽" }).click();
  await page.locator('#codetree-study-agent-root button[aria-label="뒤로"]').click();

  // ---------- M3: 6칸 (화면 순서: 입력 → 출력 → 손풀이 → 규칙 → 구조 → 경계) ----------
  const root = page.locator("#codetree-study-agent-root");
  const card = (short) => root.getByLabel(`${short} 칸`);
  const answer = async (short, text) => {
    await root.getByLabel(`${short} 답`).fill(text);
    await root.getByRole("button", { name: "확인" }).click();
  };
  await root.getByText("0/6").waitFor({ timeout: 5000 });
  check("풀기 전: 0/6, 입력 칸이 큰 카드, 번호 1 / 6", (await card("입력").count()) === 1 && (await root.locator(".qnum").innerText()).startsWith("1 / 6"));
  check("처음 보는 칸은 '왜 이 칸을 쓰나요?'가 펼쳐져 있다", (await root.locator("details.why[open]").count()) === 1);
  await root.getByText("예시 문제 보기").click();
  await root.getByText(/예제 출력: 9 \(첫째 줄\), 2 \(둘째 줄\)/).waitFor({ timeout: 3000 });
  check("흐린 예시는 다른 문제 안내 + 예시 문제 보기", (await root.locator("details.example-problem[open]").count()) === 1);
  await answer("입력", "n, m과 격자 두 개");
  await card("출력").waitFor({ timeout: 5000 });
  check("입력 통과 → 한 줄로 접히고 출력으로", (await root.getByText("요약: n, m과 격자 두 개").count()) === 1 && (await root.getByText("1/6").count()) === 1);
  const stAfter1 = await sw.evaluate(() => chrome.storage.local.get("settings"));
  check("본 칸은 whySeen에 기록", (stAfter1.settings.whySeen || []).includes(1));

  await answer("출력", "모름");
  await root.getByText("한 줄에 몇 개를 찍나요?").waitFor({ timeout: 5000 });
  check("출력 다시 → 틀린 곳을 짚는 한 줄, 그 자리, 1/3", (await card("출력").count()) === 1 && (await root.getByText(/남은 기회 2번/).count()) === 1);
  await root.getByRole("button", { name: "힌트" }).click();
  await root.getByText(/힌트 1: 같은 위치는 어떻게 찾을까요\?/).waitFor({ timeout: 5000 });
  check("칸 힌트 1단계: 코드 블록이 걸러진다", !(await root.locator(".notice.info").innerText()).includes("range"));
  if (shotDir) await page.screenshot({ path: path.join(shotDir, "m3-question.png") });
  await answer("출력", "모름");
  await root.getByText(/남은 기회 1번/).waitFor({ timeout: 5000 });
  await answer("출력", "모름");
  await card("손풀이").waitFor({ timeout: 5000 });
  check("세 번째 다시 → 답을 보여 주고 손풀이로 (화면 3번째)", (await root.getByText(/공개된 답: n줄/).count()) === 1 && (await root.locator(".qnum").innerText()).startsWith("3 / 6"));

  await answer("손풀이", "보완 a=1 2, b=1 3 → 0 1");
  await card("규칙").waitFor({ timeout: 5000 });
  check("보완 통과 → 접히고 '하나만 더' 한 줄이 남는다", (await root.getByText("하나만 더: 과정도 적어 보세요").count()) === 1);
  const ruleReq = apiCalls.filter((b) => b.output_config?.format).length;
  await root.getByRole("button", { name: "건너뛰기" }).click();
  await card("구조").waitFor();

  const countInput = root.getByLabel("구조 횟수");
  check("구조: 횟수가 비면 됨/안 됨을 못 누른다", await root.getByRole("button", { name: "됨", exact: true }).isDisabled());
  await countInput.fill("100×100 = 1만 번");
  await root.getByRole("button", { name: "안 됨" }).click();
  check("구조: '안 됨'이면 줄이기 칸이 나타난다", (await root.getByLabel("구조 줄이기").count()) === 1);
  await root.getByRole("button", { name: "됨", exact: true }).click();
  check("구조: '됨'이면 줄이기 칸이 사라진다", (await root.getByLabel("구조 줄이기").count()) === 0);
  await root.getByLabel("구조 준비").fill("없음");
  await root.getByLabel("구조 반복").fill("줄마다 칸마다 비교");
  await root.getByLabel("구조 출력").fill("줄 끝마다 출력");
  if (shotDir) await page.screenshot({ path: path.join(shotDir, "m3-structure.png") });
  await root.getByRole("button", { name: "확인" }).click();
  await card("경계").waitFor({ timeout: 5000 });
  const structReq = apiCalls.filter((b) => b.output_config?.format).at(-1);
  check("구조 답은 작은 칸을 모아 보낸다 (판정 포함, 노력 medium)", String(structReq.messages.at(-1).content).includes("횟수: 100×100 = 1만 번 → 됨\n준비: 없음\n반복: 줄마다 칸마다 비교") && structReq.output_config.effort === "medium");
  check("규칙 칸은 건너뛰어 채점 요청이 없었다", apiCalls.filter((b) => b.output_config?.format).length === ruleReq + 1);

  check("경계: 입력·정답이 없으면 확인을 못 누른다", await root.getByRole("button", { name: "확인" }).isDisabled());
  await root.getByLabel("경계 입력").fill("1 1 / 1 / 1");
  await root.getByLabel("경계 함정").fill("1×1이면 반복이 한 번");
  await root.getByLabel("경계 정답").fill("0");
  await root.getByRole("button", { name: "확인" }).click();
  await root.getByText("6/6").waitFor({ timeout: 5000 });
  check("6칸까지 진행 → 6/6, 마침 안내", (await root.getByText(/6개 질문을 마쳤어요/).count()) === 1);
  const gradeCalls = apiCalls.filter((b) => b.output_config?.format).length;
  check("채점 요청 7번 (입력1 + 출력3 + 손풀이1 + 구조1 + 경계1)", gradeCalls === 7);
  if (shotDir) await page.screenshot({ path: path.join(shotDir, "m3-done6.png") });

  // 자유 질문: 5번까지는 LLM, 6번째는 "코드를 쳐 보세요"
  const ask = async (t) => {
    await root.getByLabel("자유 질문").fill(t);
    await root.getByRole("button", { name: "보내기" }).click();
  };
  for (let i = 1; i <= 5; i++) {
    await ask(`질문 ${i}`);
    await root.locator(".bubble.ai").nth(i - 1).waitFor({ timeout: 5000 });
  }
  const chatCallsBefore = apiCalls.filter((b) => String(b.system).includes("자유 질문")).length;
  await ask("질문 6");
  await root.getByText(/질문은 여기까지 하고, 이제 코드를 쳐 보세요/).waitFor({ timeout: 5000 });
  const chatCallsAfter = apiCalls.filter((b) => String(b.system).includes("자유 질문")).length;
  check("자유 질문 6번째 → LLM 호출 없이 코드로 넘김", chatCallsBefore === 5 && chatCallsAfter === 5);
  if (shotDir) await page.screenshot({ path: path.join(shotDir, "m3-done.png") });

  // ---------- M4: 기록 ----------
  await page.waitForTimeout(800); // 자동 저장(0.4초 모음)
  let store = await sw.evaluate(() => chrome.storage.local.get(null));
  let recs = Object.values(store.records || {});
  check("손댄 풀이가 자동 저장된다 (진행 중)", recs.length === 1 && recs[0].result === null && recs[0].questions.length === 6);
  check("기록의 질문 상태 (q 1~6 순서: 입력, 출력, 규칙, 손풀이, 구조, 경계)", JSON.stringify(recs[0].questions.map((q) => q.state)) === JSON.stringify(["passed", "failed", "skipped", "passed", "passed", "passed"]));
  check("기록 id 형식, 칸 힌트는 hints에 안 들어감", /^codetree:intro-compare-two-grids:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(recs[0].id) && recs[0].hints.maxLevel === 0 && recs[0].difficulty === "Easy");

  await page.reload();
  await handle.click();
  await drawer.waitFor();
  await root.getByText("6/6").waitFor({ timeout: 10000 });
  check("새로고침해도 진행 중인 풀이를 이어 간다", (await root.locator(".bubble.ai").count()) === 5);

  await root.getByRole("tab", { name: "풀고 난 뒤" }).click();
  await root.getByRole("heading", { name: "걸린 질문" }).waitFor();
  check("풀고 난 뒤: 6칸 (걸림 1칸)", (await root.locator(".cells .cell").count()) === 6 && (await root.locator(".cells .cell.failed").count()) === 1);
  await root.getByRole("button", { name: "다 풀었어요" }).click();
  await root.getByText("이 풀이는 내 기록에 저장됐어요.").waitFor({ timeout: 5000 });
  store = await sw.evaluate(() => chrome.storage.local.get(null));
  recs = Object.values(store.records || {});
  check("끝내면 result=passed, finishedAt 기록, 진행 중 목록에서 빠짐", recs.length === 1 && recs[0].result === "passed" && !!recs[0].finishedAt && !store.active["intro-compare-two-grids"]);
  if (shotDir) await page.screenshot({ path: path.join(shotDir, "m4-after.png") });

  await root.getByRole("button", { name: "내 기록 보기" }).click();
  await root.locator(".rec").first().waitFor({ timeout: 5000 });
  check("내 기록: 제목과 결과", (await root.locator(".rec h2").first().innerText()) === "두 개의 격자 비교하기" && (await root.locator(".rec .badge").first().innerText()) === "통과");
  await root.getByRole("button", { name: "글로 복사하기" }).click();
  await root.getByText(/복사했어요/).waitFor({ timeout: 5000 });
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
  check("글로 복사하기: 클립보드에 내 기록 글", clip.startsWith("# 내 기록") && clip.includes("## 두 개의 격자 비교하기") && clip.includes("- 결과: 통과"));
  if (shotDir) await page.screenshot({ path: path.join(shotDir, "m4-records.png") });

  await root.getByRole("button", { name: "뒤로" }).click();
  await root.getByRole("button", { name: "처음부터 다시" }).click();
  await root.getByRole("tab", { name: "풀기 전" }).click();
  await root.getByText("0/6").waitFor({ timeout: 5000 });
  await root.getByRole("button", { name: "건너뛰기" }).click();
  await page.waitForTimeout(800);
  store = await sw.evaluate(() => chrome.storage.local.get(null));
  recs = Object.values(store.records || {}).sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  check("다시 풀면 새 기록 (2건, 이전 기록 그대로)", recs.length === 2 && recs[0].result === "passed" && recs[1].result === null && recs[0].id !== recs[1].id);

  // ---------- 리셋 ----------
  const readStore = () => sw.evaluate(() => chrome.storage.local.get(null));
  await root.getByRole("button", { name: "처음부터 다시" }).click();
  await root.getByRole("button", { name: "지우고 다시" }).click();
  await root.getByText("0/6").waitFor({ timeout: 5000 });
  await page.waitForTimeout(800);
  store = await readStore();
  recs = Object.values(store.records || {});
  check("처음부터 다시(진행 중): 그 풀이 기록을 지우고 0/6", recs.length === 1 && recs[0].result === "passed" && !store.active["intro-compare-two-grids"]);

  await root.getByRole("button", { name: "건너뛰기" }).click();
  await page.waitForTimeout(800);
  await root.getByRole("button", { name: "설정" }).click();
  await root.getByRole("button", { name: "보기" }).click();
  await root.locator(".rec").nth(1).waitFor({ timeout: 5000 });
  await root.getByRole("button", { name: "이 기록 지우기" }).first().click(); // 최신순이라 첫 칸이 진행 중인 풀이
  await root.getByRole("button", { name: "지우기", exact: true }).click();
  await page.waitForTimeout(1000);
  store = await readStore();
  recs = Object.values(store.records || {});
  check("내 기록에서 하나 지우기 (지금 풀이를 지워도 되살아나지 않음)", recs.length === 1 && recs[0].result === "passed" && (await root.locator(".rec").count()) === 1);
  if (shotDir) await page.screenshot({ path: path.join(shotDir, "reset-records.png") });

  await root.getByRole("button", { name: "모든 기록 지우기" }).click();
  await root.getByRole("button", { name: "모두 지우기" }).click();
  await root.getByText("아직 기록이 없어요").waitFor({ timeout: 5000 });
  store = await readStore();
  check("모든 기록 지우기: 기록만 지우고 설정·키는 남김", Object.keys(store.records).length === 0 && Object.keys(store.active).length === 0 && store.secrets?.["claude-api"] === "sk-ant-fake-key" && !!store.settings);
  await root.getByRole("button", { name: "뒤로" }).click();
  await root.getByText("0/6").waitFor({ timeout: 5000 });
  check("지운 뒤 풀기 전 화면은 새 풀이(0/6)", true);

  if (typeof globalThis.extraChecks === "function") await globalThis.extraChecks({ ctx, sw, page, check, shotDir });

  console.log(results.join("\n"));
  await ctx.close();
  if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
