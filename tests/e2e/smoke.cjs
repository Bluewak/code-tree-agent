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

(async () => {
  const ctx = await chromium.launchPersistentContext("", {
    headless: true,
    channel: "chromium",
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  await ctx.route("https://www.codetree.ai/**", (r) => r.fulfill({ contentType: "text/html", body: html }));
  await ctx.route("https://api.anthropic.com/**", (r) => r.abort());
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
  await page.locator("#codetree-study-agent-root .statement").waitFor();
  check("제목이 서랍에 보인다", (await page.locator("#codetree-study-agent-root h1").innerText()) === "두 개의 격자 비교하기");
  const st = await page.locator("#codetree-study-agent-root .statement").innerText();
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

  if (typeof globalThis.extraChecks === "function") await globalThis.extraChecks({ ctx, sw, page, check, shotDir });

  console.log(results.join("\n"));
  await ctx.close();
  if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
