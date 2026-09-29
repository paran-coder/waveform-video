// 파형 5종과 부가 요소가 실제로 그려지는지 확인하고, 확인용 PNG를 임시 폴더에 저장하는 테스트
import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { Analyzer } from "./audio";
import { renderFrame, setScratchFactory } from "./render";
import { BUILTIN_PRESETS, getSize, mergeSettings, type WaveType } from "./settings";

setScratchFactory((w, h) => {
  const c = createCanvas(w, h);
  return { canvas: c as unknown as CanvasImageSource, ctx: c.getContext("2d") as unknown as CanvasRenderingContext2D };
});

const sr = 44100;
// 저음, 중음, 고음이 섞인 가짜 음악
const sig = new Float32Array(sr * 6);
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
for (let i = 0; i < sig.length; i++) {
  const t = i / sr;
  const kick = Math.exp(-(t % 0.5) * 10) * Math.sin(2 * Math.PI * 55 * t);
  sig[i] =
    0.5 * kick +
    0.15 * Math.sin(2 * Math.PI * 220 * t) +
    0.1 * Math.sin(2 * Math.PI * 880 * t) +
    0.05 * Math.sin(2 * Math.PI * 3520 * t) +
    0.03 * rnd();
}
const analyzer = new Analyzer(sig, sr);
const dir = "/tmp/wf-preview";
mkdirSync(dir, { recursive: true });

function render(name: string, patch: Parameters<typeof mergeSettings>[0], t = 2.02) {
  const s = mergeSettings(patch);
  const [w, h] = getSize(s.aspect, s.resolution);
  const c = createCanvas(w, h);
  const ctx = c.getContext("2d") as unknown as CanvasRenderingContext2D;
  const frame = analyzer.getFrame(t, { bands: s.barCount, smoothing: s.smoothing });
  const assets = {} as Parameters<typeof renderFrame>[4];
  renderFrame(ctx, w, h, s, assets, frame, t, 6, 1);
  writeFileSync(`${dir}/${name}.png`, c.toBuffer("image/png"));
  const data = (c.getContext("2d") as unknown as CanvasRenderingContext2D).getImageData(0, 0, w, h).data;
  return { data, w, h };
}

describe("renderFrame", () => {
  const types: WaveType[] = ["bars", "mirror", "line", "circle", "dots"];
  for (const type of types) {
    it(`${type} 파형이 배경과 다르게 그려진다`, () => {
      const bg = render(`bg-only-${type}`, { waveType: type, width: 0, height: 0, glow: 0, progressOn: false });
      const withWave = render(`wave-${type}`, { waveType: type, title: "테스트 곡 제목", artist: "아티스트" });
      let diff = 0;
      for (let i = 0; i < withWave.data.length; i += 4) {
        if (withWave.data[i] !== bg.data[i] || withWave.data[i + 1] !== bg.data[i + 1]) diff++;
      }
      expect(diff).toBeGreaterThan(withWave.w * withWave.h * 0.01);
    });
  }

  it("내장 프리셋과 세로 비율이 모두 렌더링된다", () => {
    for (const [name, p] of Object.entries(BUILTIN_PRESETS)) {
      const r = render(`preset-${name}`, { ...p, title: "Sample Song", artist: "Artist" });
      expect(r.w * r.h).toBeGreaterThan(0);
    }
  });

  it("페이드가 0이면 화면이 검정이다", () => {
    const s = mergeSettings({});
    const [w, h] = getSize(s.aspect, s.resolution);
    const c = createCanvas(w, h);
    const ctx = c.getContext("2d") as unknown as CanvasRenderingContext2D;
    renderFrame(ctx, w, h, s, {}, analyzer.getFrame(1, { bands: 48, smoothing: 0 }), 1, 6, 0);
    const px = ctx.getImageData(w / 2, h / 2, 1, 1).data;
    expect([px[0], px[1], px[2]]).toEqual([0, 0, 0]);
  });
});
