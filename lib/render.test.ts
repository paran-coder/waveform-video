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
    for (const { name, patch } of BUILTIN_PRESETS) {
      const r = render(`preset-${name}`, { ...patch, title: "Sample Song", artist: "Artist" });
      expect(r.w * r.h).toBeGreaterThan(0);
    }
  });

  it("프리셋이 12종 이상이고 이름이 겹치지 않는다", () => {
    const names = BUILTIN_PRESETS.map((p) => p.name);
    expect(names.length).toBeGreaterThanOrEqual(12);
    expect(new Set(names).size).toBe(names.length);
  });

  it("자막을 끄면 제목과 아티스트가 그려지지 않는다", () => {
    const on = render("text-on", { width: 0, height: 0, glow: 0, title: "Sample Song", artist: "Artist", progressOn: false });
    const off = render("text-off", { width: 0, height: 0, glow: 0, title: "Sample Song", artist: "Artist", textOn: false, progressOn: false });
    const count = (d: Uint8ClampedArray) => {
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 200 && d[i + 1] > 200) n++;
      return n;
    };
    expect(count(on.data)).toBeGreaterThan(50);
    expect(count(off.data)).toBe(0);
  });

  it("로고는 선택한 모서리에서 여백만큼 떨어져 그려진다", () => {
    const logoImg = createCanvas(100, 50);
    const lctx = logoImg.getContext("2d");
    lctx.fillStyle = "#ff0000";
    lctx.fillRect(0, 0, 100, 50);
    const at = (anchor: "tl" | "br" | "tc") => {
      const s = mergeSettings({ width: 0, height: 0, glow: 0, progressOn: false, dim: 0, bgColor: "#000000", bgColor2: "#000000", logo: { ...mergeSettings({}).logo, enabled: true, anchor, margin: 0.05, size: 0.2, opacity: 1, radius: 0 } });
      const [w, h] = getSize(s.aspect, s.resolution);
      const c = createCanvas(w, h);
      const ctx = c.getContext("2d") as unknown as CanvasRenderingContext2D;
      renderFrame(ctx, w, h, s, { logo: logoImg as unknown as CanvasImageSource }, analyzer.getFrame(1, { bands: 48, smoothing: 0 }), 1, 6, 1);
      const px = (x: number, y: number) => Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3));
      return { w, h, px };
    };
    const m = 720 * 0.05; // 여백 36px, 로고 너비 144px, 높이 72px
    const tl = at("tl");
    expect(tl.px(m + 5, m + 5)).toEqual([255, 0, 0]);
    expect(tl.px(m - 5, m + 5)).toEqual([0, 0, 0]);
    const br = at("br");
    expect(br.px(br.w - m - 5, br.h - m - 5)).toEqual([255, 0, 0]);
    expect(br.px(br.w - m + 5, br.h - m - 5)).toEqual([0, 0, 0]);
    const tc = at("tc");
    expect(tc.px(tc.w / 2, m + 5)).toEqual([255, 0, 0]);
  });

  it("투명 모드는 배경을 그리지 않고 파형만 알파값을 가진다", () => {
    const s = mergeSettings({ glow: 0, progressOn: false });
    const [w, h] = getSize(s.aspect, s.resolution);
    const c = createCanvas(w, h);
    const ctx = c.getContext("2d") as unknown as CanvasRenderingContext2D;
    renderFrame(ctx, w, h, s, {}, analyzer.getFrame(2, { bands: 48, smoothing: 0 }), 2, 6, 1, { transparent: true });
    const d = ctx.getImageData(0, 0, w, h).data;
    expect(d[3]).toBe(0); // 왼쪽 위 모서리는 완전 투명
    let opaque = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 200) opaque++;
    expect(opaque).toBeGreaterThan(500); // 파형은 그려짐
    expect(opaque).toBeLessThan(w * h * 0.5);
  });

  it("투명 모드의 페이드는 알파를 줄이고, 0이면 전부 투명하다", () => {
    const s = mergeSettings({ glow: 0, progressOn: false });
    const [w, h] = getSize(s.aspect, s.resolution);
    const alphaSum = (fade: number) => {
      const c = createCanvas(w, h);
      const ctx = c.getContext("2d") as unknown as CanvasRenderingContext2D;
      renderFrame(ctx, w, h, s, {}, analyzer.getFrame(2, { bands: 48, smoothing: 0 }), 2, 6, fade, { transparent: true });
      const d = ctx.getImageData(0, 0, w, h).data;
      let sum = 0;
      for (let i = 3; i < d.length; i += 4) sum += d[i];
      return sum;
    };
    const full = alphaSum(1);
    const half = alphaSum(0.5);
    expect(half).toBeLessThan(full * 0.6);
    expect(half).toBeGreaterThan(full * 0.4);
    expect(alphaSum(0)).toBe(0);
  });

  it("단색 배경 모드는 배경을 지정한 색으로만 채운다", () => {
    const s = mergeSettings({ glow: 0, progressOn: false, width: 0, height: 0 });
    const [w, h] = getSize(s.aspect, s.resolution);
    const c = createCanvas(w, h);
    const ctx = c.getContext("2d") as unknown as CanvasRenderingContext2D;
    renderFrame(ctx, w, h, s, {}, analyzer.getFrame(1, { bands: 48, smoothing: 0 }), 1, 6, 1, { solidBg: "#00ff00" });
    expect(Array.from(ctx.getImageData(10, 10, 1, 1).data)).toEqual([0, 255, 0, 255]);
    expect(Array.from(ctx.getImageData(w - 10, h - 10, 1, 1).data)).toEqual([0, 255, 0, 255]);
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
