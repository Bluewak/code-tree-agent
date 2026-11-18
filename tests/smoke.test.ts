import { readFileSync } from "node:fs";

describe("매니페스트", () => {
  it("MV3이고 단축키 기본값이 Alt+Q다", () => {
    const m = JSON.parse(readFileSync("src/manifest.json", "utf8"));
    expect(m.manifest_version).toBe(3);
    expect(m.commands["toggle-drawer"].suggested_key.default).toBe("Alt+Q");
  });
});
