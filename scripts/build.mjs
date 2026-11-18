// 확장 빌드: esbuild로 진입점 4개를 묶고, 매니페스트·글꼴·아이콘을 dist/에 둔다.
// Vite 대신 esbuild를 직접 쓰는 이유는 docs/DECISIONS.md 참고.
import * as esbuild from "esbuild";
import { mkdirSync, rmSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { Buffer } from "node:buffer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "fonts"), { recursive: true });
mkdirSync(join(dist, "icons"), { recursive: true });

// ---------- 글꼴 ----------
// 페이지 글꼴과 섞이지 않게 이름을 바꿔 등록한다. woff2만, 본문 400/600, 코드 400.
const FONT_FAMILIES = {
  "IBM Plex Sans KR": "CSA Plex Sans KR",
  "IBM Plex Mono": "CSA Plex Mono",
};
const fontSources = [
  ["@fontsource/ibm-plex-sans-kr", "400.css"],
  ["@fontsource/ibm-plex-sans-kr", "600.css"],
  ["@fontsource/ibm-plex-mono", "400.css"],
];
const MONO_SUBSETS = /latin/; // 코드 글꼴은 라틴 계열만 넣는다

let fontCss = "";
for (const [pkg, file] of fontSources) {
  const pkgDir = join(root, "node_modules", pkg);
  const css = readFileSync(join(pkgDir, file), "utf8");
  for (const block of css.split("@font-face").slice(1)) {
    const body = block.slice(block.indexOf("{") + 1, block.indexOf("}"));
    const woff2 = body.match(/url\(\.\/files\/([^)]+\.woff2)\)/);
    if (!woff2) continue;
    const fileName = woff2[1];
    if (pkg.endsWith("mono") && !MONO_SUBSETS.test(fileName)) continue;
    copyFileSync(join(pkgDir, "files", fileName), join(dist, "fonts", fileName));
    let rule = body
      .replace(/src:[^;]+;/, `src: url(__FONT_BASE__${fileName}) format('woff2');`)
      .replace(/font-family:\s*'([^']+)'/, (_m, fam) => `font-family: '${FONT_FAMILIES[fam] ?? fam}'`);
    rule = rule.replace(/\s+/g, " ").trim();
    fontCss += `@font-face{${rule}}\n`;
  }
}
// 옵션 페이지용(같은 확장 안이라 상대 경로)
writeFileSync(join(dist, "fonts", "fonts.css"), fontCss.replaceAll("__FONT_BASE__", "./"));

// ---------- 아이콘 ----------
// 초록 바탕에 흰 '<'. 외부 이미지 없이 PNG를 직접 만든다.
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function icon(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const r = size * 0.22; // 모서리
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size);
      let px = [Math.round(0x34 + (0x2a - 0x34) * t), Math.round(0x82 + (0x6e - 0x82) * t), Math.round(0x5a + (0x48 - 0x5a) * t), 255];
      const cx = Math.min(Math.max(x + 0.5, r), size - r), cy = Math.min(Math.max(y + 0.5, r), size - r);
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > r) px = [0, 0, 0, 0];
      // '<' : 두 선분까지의 거리
      const ax = size * 0.62, ay = size * 0.26, bx = size * 0.36, by = size * 0.5, ex = size * 0.62, ey = size * 0.74;
      const d = Math.min(segDist(x + 0.5, y + 0.5, ax, ay, bx, by), segDist(x + 0.5, y + 0.5, bx, by, ex, ey));
      if (px[3] && d < size * 0.07) px = [255, 255, 255, 255];
      raw.set(px, y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
  ]);
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
for (const s of [16, 48, 128]) writeFileSync(join(dist, "icons", `${s}.png`), icon(s));

// ---------- 매니페스트, HTML ----------
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "src", "manifest.json"), "utf8"));
manifest.version = pkg.version;
writeFileSync(join(dist, "manifest.json"), JSON.stringify(manifest, null, 2));
copyFileSync(join(root, "src", "options", "options.html"), join(dist, "options.html"));

// ---------- 스크립트 ----------
const common = {
  bundle: true,
  target: "chrome111",
  jsx: "automatic",
  jsxImportSource: "preact",
  logLevel: "info",
  legalComments: "none",
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  define: { __FONT_CSS__: JSON.stringify(fontCss) },
};
const builds = [
  { entryPoints: { background: "src/background/index.ts" }, format: "esm" },
  { entryPoints: { content: "src/content/index.tsx" }, format: "iife" },
  { entryPoints: { mainworld: "src/mainworld/index.ts" }, format: "iife" },
  { entryPoints: { options: "src/options/index.tsx" }, format: "iife" },
].map((b) => ({ ...common, ...b, outdir: dist, absWorkingDir: root }));

if (watch) {
  for (const b of builds) (await esbuild.context(b)).watch();
} else {
  await Promise.all(builds.map((b) => esbuild.build(b)));
  const files = readdirSync(dist);
  console.log(`dist/: ${files.join(", ")} (글꼴 ${readdirSync(join(dist, "fonts")).length - 1}개)`);
}
