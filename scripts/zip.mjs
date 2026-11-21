// 공유용 압축 파일 만들기: 빌드한 뒤 dist/의 내용과 INSTALL.md를 release/codetree-study-agent-v<버전>.zip으로 묶는다.
// 압축 파일 맨 위에 manifest.json이 오게 한다(받는 사람이 푼 폴더를 그대로 고르면 되도록).
// 외부 패키지 없이 Node 기본 기능(zlib)만 쓴다.

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { Buffer } from "node:buffer";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

execSync("node scripts/build.mjs", { cwd: root, stdio: "inherit" });

/** @type {{ name: string, data: Buffer }[]} */
const entries = [];
function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else entries.push({ name: relative(dist, full).split(sep).join("/"), data: readFileSync(full) });
  }
}
walk(dist);
entries.push({ name: "INSTALL.md", data: readFileSync(join(root, "INSTALL.md")) });

// ---------- 최소 ZIP 작성기 (deflate) ----------
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function dosTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

const now = dosTime(new Date());
const locals = [];
const centrals = [];
let offset = 0;
for (const e of entries) {
  const nameBuf = Buffer.from(e.name, "utf8");
  const deflated = deflateRawSync(e.data, { level: 9 });
  const useDeflate = deflated.length < e.data.length;
  const body = useDeflate ? deflated : e.data;
  const crc = crc32(e.data);
  const flags = 0x0800; // 파일 이름 UTF-8

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(flags, 6);
  local.writeUInt16LE(useDeflate ? 8 : 0, 8);
  local.writeUInt16LE(now.time, 10);
  local.writeUInt16LE(now.date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(e.data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  locals.push(local, nameBuf, body);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(flags, 8);
  central.writeUInt16LE(useDeflate ? 8 : 0, 10);
  central.writeUInt16LE(now.time, 12);
  central.writeUInt16LE(now.date, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(e.data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, nameBuf);

  offset += local.length + nameBuf.length + body.length;
}
const centralBuf = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);

const outDir = join(root, "release");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `codetree-study-agent-v${pkg.version}.zip`);
writeFileSync(out, Buffer.concat([...locals, centralBuf, end]));
console.log(`\n만들었습니다: ${relative(root, out)} (파일 ${entries.length}개, ${(statSync(out).size / 1024 / 1024).toFixed(1)}MB)`);
console.log("이 파일 하나와 함께 \"압축을 풀고 INSTALL.md를 보세요\"라고 전해 주세요.");
