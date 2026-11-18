// @vitest-environment jsdom
// 실행 결과 지켜보기 (DOM 쪽). jsdom에는 innerText가 없어 textContent로 대신한다.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { watchRuns } from "../src/sites/codetree/reader";

const fx = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent ?? "";
    },
  });
});

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("watchRuns", () => {
  it("화면이 바뀌어 새 결과가 뜨면 알리고, 처음 떠 있던 결과는 세지 않는다", async () => {
    const pre = document.createElement("pre");
    pre.textContent = fx("codetree-mismatch.txt");
    document.body.appendChild(pre);
    const seen: string[] = [];
    const stop = watchRuns(document, (r) => seen.push(r.kind), { quietMs: 20, maxWaitMs: 100 });
    await tick(60);
    expect(seen).toEqual([]);

    pre.textContent = fx("codetree-noresult.txt"); // 실행 중 (결과 사라짐)
    await tick(60);
    pre.textContent = fx("codetree-error.txt");
    await tick(60);
    pre.textContent = fx("codetree-pass.txt");
    await tick(60);
    expect(seen).toEqual(["error", "pass"]);

    stop();
    pre.textContent = fx("codetree-mismatch.txt");
    await tick(60);
    expect(seen).toEqual(["error", "pass"]);
    pre.remove();
  });
});
