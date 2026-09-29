// 투명 MOV 내보내기 전체 흐름(프레임 수, 오디오 조각 나눔, 페이드, 취소, 용량 보호)을 검증하는 테스트. ffmpeg가 있으면 실제로 디코딩한다.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { beforeAll, describe, expect, it } from "vitest";
import { Analyzer } from "./audio";
import { exportMov } from "./exportMov";
import { mergeSettings } from "./settings";

beforeAll(() => {
  (globalThis as Record<string, unknown>).document = {
    createElement: () => {
      const c = createCanvas(2, 2);
      (c as unknown as { toBlob: (cb: (b: Blob) => void) => void }).toBlob = (cb) => cb(new Blob([new Uint8Array(c.toBuffer("image/png"))], { type: "image/png" }));
      return c;
    },
  };
});

const sr = 8000;
const SEC = 2.4;
const data = new Float32Array(Math.round(sr * 3));
for (let i = 0; i < data.length; i++) data[i] = 0.4 * Math.sin((2 * Math.PI * 300 * i) / sr);
const buf = { sampleRate: sr, numberOfChannels: 1, length: data.length, duration: 3, getChannelData: () => data } as unknown as AudioBuffer;
const analyzer = new Analyzer(data, sr);
const base = { buffer: buf, analyzer, assets: {} };
const tl = { start: 0.3, end: 0.3 + SEC, fadeIn: 0.5, fadeOut: 0 };
const settings = mergeSettings({ fps: 30, resolution: 720, glow: 0, progressOn: false });

function findFfmpeg(): string | null {
  for (const c of [process.env.FFMPEG_PATH, "ffmpeg"].filter(Boolean) as string[]) {
    if (c !== "ffmpeg" && !existsSync(c)) continue;
    if (spawnSync(c, ["-version"]).status === 0) return c;
  }
  return null;
}
const ffmpeg = findFfmpeg();

describe("exportMov", () => {
  it("취소하면 AbortError로 중단한다", async () => {
    const ac = new AbortController();
    const p = exportMov({ ...base, settings, timeline: tl, signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  it("MOV 파일이 만들어지고 오디오를 빼면 트랙이 하나다", async () => {
    const withA = new Uint8Array(await (await exportMov({ ...base, settings, timeline: { ...tl, end: 0.8 } })).arrayBuffer());
    const noA = new Uint8Array(await (await exportMov({ ...base, settings, timeline: { ...tl, end: 0.8 }, includeAudio: false })).arrayBuffer());
    const count = (b: Uint8Array) => (new TextDecoder("latin1").decode(b).match(/sowt/g) ?? []).length;
    expect(count(withA)).toBe(1);
    expect(count(noA)).toBe(0);
    expect(new TextDecoder("latin1").decode(withA.slice(4, 8))).toBe("ftyp");
  });
});

describe.skipIf(!ffmpeg)("exportMov 결과를 ffmpeg로 디코딩", () => {
  it("프레임 수, 오디오 길이, 페이드, 투명도가 맞다", async () => {
    const blob = await exportMov({ ...base, settings, timeline: tl });
    const dir = mkdtempSync(join(tmpdir(), "exmov-"));
    const file = join(dir, "out.mov");
    writeFileSync(file, new Uint8Array(await blob.arrayBuffer()));

    const info = spawnSync(ffmpeg!, ["-hide_banner", "-i", file], { encoding: "utf8" }).stderr;
    expect(info).toMatch(/Video: png .*rgba/);
    expect(info).toContain("1280x720");
    expect(info).toMatch(/Audio: pcm_s16le.*8000 Hz, mono/);

    const warn = spawnSync(ffmpeg!, ["-hide_banner", "-v", "warning", "-i", file, "-f", "null", "-"], { encoding: "utf8" }).stderr;
    expect(warn.trim()).toBe("");

    execFileSync(ffmpeg!, ["-hide_banner", "-loglevel", "error", "-i", file, "-map", "0:v", "-pix_fmt", "rgba", join(dir, "f_%03d.png")]);
    const frames = readdirSync(dir).filter((f) => f.startsWith("f_")).sort();
    expect(frames).toHaveLength(Math.round(SEC * 30));
    const img = await loadImage(readFileSync(join(dir, frames[40])));
    const c = createCanvas(img.width, img.height);
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    expect(ctx.getImageData(5, 5, 1, 1).data[3]).toBe(0);
    const d = ctx.getImageData(0, 0, img.width, img.height).data;
    let opaque = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 200) opaque++;
    expect(opaque).toBeGreaterThan(300);

    const raw = execFileSync(ffmpeg!, ["-hide_banner", "-loglevel", "error", "-i", file, "-map", "0:a", "-f", "s16le", "-"], { maxBuffer: 1 << 26 });
    expect(raw.length / 2).toBe(Math.round(SEC * sr));
    const s16 = new Int16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
    expect(Math.abs(s16[0])).toBeLessThan(5); // 페이드 인으로 시작은 조용하다
    const peak = (from: number, to: number) => s16.slice(from, to).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak(Math.round(1.5 * sr), Math.round(2 * sr))).toBeGreaterThan(0.35 * 32767); // 페이드가 끝난 뒤에는 원래 크기
    expect(peak(0, Math.round(0.1 * sr))).toBeLessThan(0.3 * 32767);
  }, 60_000);
});
