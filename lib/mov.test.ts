// MOV 작성기의 박스 구조를 직접 읽어 확인하고, ffmpeg가 있으면 실제로 디코딩해 프레임, 알파, 오디오를 검증하는 테스트
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { MovWriter } from "./mov";

const FRAMES = 10;
const FPS = 30;
const W = 64;
const H = 48;
const SR = 44100;

// i번째 프레임은 (4+4i, 8) 위치에 반투명 빨간 사각형이 있고 나머지는 완전 투명
function pngFrame(i: number): Uint8Array {
  const c = createCanvas(W, H);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "rgba(255,0,0,0.5)";
  ctx.fillRect(4 + 4 * i, 8, 10, 10);
  return new Uint8Array(c.toBuffer("image/png"));
}

function makePcm(frames: number, channels: number): Uint8Array {
  const v = new DataView(new ArrayBuffer(frames * channels * 2));
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < channels; c++) v.setInt16((i * channels + c) * 2, Math.round(8000 * Math.sin((2 * Math.PI * (300 + 100 * c) * i) / SR)), true);
  return new Uint8Array(v.buffer);
}

async function toBytes(withAudio: boolean) {
  const w = new MovWriter({ width: W, height: H, fps: FPS, audio: withAudio ? { channels: 2, sampleRate: SR } : undefined });
  const pcm = makePcm(Math.round((FRAMES / FPS) * SR), 2);
  for (let i = 0; i < FRAMES; i++) w.addVideoFrame(pngFrame(i));
  if (withAudio) w.addAudio(pcm);
  return { bytes: new Uint8Array(await w.finish().arrayBuffer()), pcm };
}

type Node = { type: string; start: number; end: number; body: number; kids: Node[] };
const CONT = new Set(["moov", "trak", "mdia", "minf", "stbl", "dinf"]);
function parse(b: Uint8Array, start = 0, end = b.length): Node[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: Node[] = [];
  let o = start;
  while (o < end) {
    const size = dv.getUint32(o);
    const type = String.fromCharCode(...b.slice(o + 4, o + 8));
    const n: Node = { type, start: o, end: o + size, body: o + 8, kids: [] };
    if (CONT.has(type)) n.kids = parse(b, o + 8, o + size);
    out.push(n);
    o += size;
  }
  return out;
}
const find = (nodes: Node[], ...path: string[]): Node | undefined => {
  let cur: Node | undefined;
  let list = nodes;
  for (const p of path) {
    cur = list.find((n) => n.type === p);
    if (!cur) return undefined;
    list = cur.kids;
  }
  return cur;
};

describe("MovWriter 구조", () => {
  it("ftyp, mdat, moov 순서이고 박스 크기가 파일 전체와 정확히 맞는다", async () => {
    const { bytes } = await toBytes(true);
    const top = parse(bytes);
    expect(top.map((n) => n.type)).toEqual(["ftyp", "mdat", "moov"]);
    expect(top[2].end).toBe(bytes.length);
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe("qt  ");
  });

  it("비디오 chunk 오프셋이 실제 PNG 시작 위치를 가리키고 크기가 일치한다", async () => {
    const { bytes } = await toBytes(true);
    const dv = new DataView(bytes.buffer);
    const top = parse(bytes);
    const traks = top[2].kids.filter((n) => n.type === "trak");
    expect(traks).toHaveLength(2);
    const stbl = find(traks[0].kids, "mdia", "minf", "stbl")!;
    const stco = stbl.kids.find((n) => n.type === "stco")!;
    const stsz = stbl.kids.find((n) => n.type === "stsz")!;
    const count = dv.getUint32(stco.body + 4);
    expect(count).toBe(FRAMES);
    expect(dv.getUint32(stsz.body + 8)).toBe(FRAMES);
    for (let i = 0; i < count; i++) {
      const off = dv.getUint32(stco.body + 8 + i * 4);
      const size = dv.getUint32(stsz.body + 12 + i * 4);
      expect(Array.from(bytes.slice(off, off + 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(Array.from(bytes.slice(off + size - 8, off + size - 4))).toEqual([0x49, 0x45, 0x4e, 0x44]); // IEND 청크 이름
    }
  });

  it("오디오 없이 만들면 트랙이 하나뿐이다", async () => {
    const { bytes } = await toBytes(false);
    expect(parse(bytes)[2].kids.filter((n) => n.type === "trak")).toHaveLength(1);
  });

  it("샘플레이트가 65535Hz를 넘으면 오류를 낸다", () => {
    expect(() => new MovWriter({ width: 2, height: 2, fps: 30, audio: { channels: 2, sampleRate: 96000 } })).toThrow();
  });
});

// ffmpeg가 있을 때만 실제 디코딩으로 검증한다. FFMPEG_PATH 환경변수나 PATH의 ffmpeg를 사용한다.
function findFfmpeg(): string | null {
  const cands = [process.env.FFMPEG_PATH, "ffmpeg"].filter(Boolean) as string[];
  for (const c of cands) {
    if (c !== "ffmpeg" && !existsSync(c)) continue;
    const r = spawnSync(c, ["-version"]);
    if (r.status === 0) return c;
  }
  return null;
}
const ffmpeg = findFfmpeg();

describe.skipIf(!ffmpeg)("MOV를 ffmpeg로 디코딩", () => {
  it("코덱, 해상도, fps, 오디오 사양이 정확하고 프레임의 알파와 오디오 샘플이 그대로다", async () => {
    const { bytes, pcm } = await toBytes(true);
    const dir = mkdtempSync(join(tmpdir(), "mov-"));
    const file = join(dir, "t.mov");
    writeFileSync(file, bytes);

    const info = spawnSync(ffmpeg!, ["-hide_banner", "-i", file], { encoding: "utf8" }).stderr;
    expect(info).toMatch(/Video: png .*rgba/);
    expect(info).toContain("64x48");
    expect(info).toMatch(/30 fps/);
    expect(info).toMatch(/Audio: pcm_s16le.*44100 Hz, stereo/);

    execFileSync(ffmpeg!, ["-hide_banner", "-loglevel", "error", "-i", file, "-map", "0:v", "-pix_fmt", "rgba", join(dir, "f_%03d.png")]);
    const frames = readdirSync(dir).filter((f) => f.startsWith("f_")).sort();
    expect(frames).toHaveLength(FRAMES);
    for (const i of [0, 4, 9]) {
      const img = await loadImage(readFileSync(join(dir, frames[i])));
      const c = createCanvas(img.width, img.height);
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const inside = ctx.getImageData(4 + 4 * i + 5, 13, 1, 1).data;
      expect(inside[3]).toBeGreaterThan(120);
      expect(inside[3]).toBeLessThan(135);
      expect(inside[0]).toBeGreaterThan(200);
      expect(ctx.getImageData(1, 1, 1, 1).data[3]).toBe(0);
    }

    const raw = execFileSync(ffmpeg!, ["-hide_banner", "-loglevel", "error", "-i", file, "-map", "0:a", "-f", "s16le", "-"], { maxBuffer: 1 << 26 });
    expect(raw.length).toBe(pcm.length);
    expect(Buffer.compare(Buffer.from(raw), Buffer.from(pcm))).toBe(0);
  });
});
