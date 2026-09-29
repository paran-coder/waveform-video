// PNG 시퀀스 ZIP의 구성(프레임 수, 이름, 투명도, audio.wav, README)과 취소, 용량 보호를 검증하는 테스트
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { unzipSync } from "fflate";
import { beforeAll, describe, expect, it } from "vitest";
import { Analyzer } from "./audio";
import { exportPngSequence } from "./exportPng";
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
const data = new Float32Array(sr * 3);
for (let i = 0; i < data.length; i++) data[i] = 0.4 * Math.sin((2 * Math.PI * 300 * i) / sr);
const buf = { sampleRate: sr, numberOfChannels: 1, length: data.length, duration: 3, getChannelData: () => data } as unknown as AudioBuffer;
const analyzer = new Analyzer(data, sr);
const base = { buffer: buf, analyzer, assets: {} };
const tl = { start: 0, end: 1, fadeIn: 0, fadeOut: 0 };

describe("exportPngSequence", () => {
  it("프레임 수만큼 PNG와 audio.wav, README가 들어 있고 배경이 투명하다", async () => {
    const settings = mergeSettings({ fps: 30, resolution: 720, glow: 0, progressOn: false });
    const blob = await exportPngSequence({ ...base, settings, timeline: tl });
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    const names = Object.keys(files);
    const pngs = names.filter((n) => n.endsWith(".png")).sort();
    expect(pngs.length).toBe(30);
    expect(pngs[0]).toBe("frames/waveform_00001.png");
    expect(pngs[29]).toBe("frames/waveform_00030.png");
    expect(names).toContain("audio.wav");
    expect(names).toContain("README.txt");
    expect(new TextDecoder().decode(files["README.txt"])).toContain("30fps");
    expect(new TextDecoder().decode(files["audio.wav"].slice(0, 4))).toBe("RIFF");

    const img = await loadImage(Buffer.from(files[pngs[10]]));
    const c = createCanvas(img.width, img.height);
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    expect(img.width).toBe(1280);
    expect(ctx.getImageData(5, 5, 1, 1).data[3]).toBe(0);
    const d = ctx.getImageData(0, 0, img.width, img.height).data;
    let opaque = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 200) opaque++;
    expect(opaque).toBeGreaterThan(300);
  });

  it("음원을 빼면 audio.wav가 없다", async () => {
    const blob = await exportPngSequence({ ...base, settings: mergeSettings({ fps: 30 }), timeline: { ...tl, end: 0.5 }, includeAudio: false });
    const names = Object.keys(unzipSync(new Uint8Array(await blob.arrayBuffer())));
    expect(names).not.toContain("audio.wav");
    expect(names.filter((n) => n.endsWith(".png")).length).toBe(15);
  });

  it("취소하면 AbortError로 중단한다", async () => {
    const ac = new AbortController();
    const p = exportPngSequence({ ...base, settings: mergeSettings({}), timeline: tl, signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});
