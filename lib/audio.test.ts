// FFT 정확도와 분석기의 주파수 대응, 결정성을 검증하는 테스트
import { describe, expect, it } from "vitest";
import { Analyzer, FFT } from "./audio";

describe("FFT", () => {
  it("순수 DFT와 결과가 일치한다", () => {
    const n = 64;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    const x = Array.from({ length: n }, (_, i) => Math.sin(i * 0.7) + 0.3 * Math.cos(i * 2.1));
    x.forEach((v, i) => (re[i] = v));
    new FFT(n).transform(re, im);
    for (const k of [0, 1, 5, 17, 32, 40]) {
      let sr = 0;
      let si = 0;
      for (let i = 0; i < n; i++) {
        sr += x[i] * Math.cos((2 * Math.PI * k * i) / n);
        si -= x[i] * Math.sin((2 * Math.PI * k * i) / n);
      }
      expect(re[k]).toBeCloseTo(sr, 3);
      expect(im[k]).toBeCloseTo(si, 3);
    }
  });
});

function synth(sr: number, sec: number, fn: (t: number) => number): Float32Array {
  const out = new Float32Array(Math.round(sr * sec));
  for (let i = 0; i < out.length; i++) out[i] = fn(i / sr);
  return out;
}

describe("Analyzer", () => {
  const sr = 44100;
  const opts = { bands: 64, smoothing: 0 };

  it("1kHz 사인파는 1kHz 근처 밴드에서 가장 크다", () => {
    const a = new Analyzer(synth(sr, 3, (t) => 0.5 * Math.sin(2 * Math.PI * 1000 * t)), sr);
    const { spectrum } = a.getFrame(1.5, opts);
    let peak = 0;
    for (let i = 1; i < spectrum.length; i++) if (spectrum[i] > spectrum[peak]) peak = i;
    const fMax = Math.min(16000, (sr / 2) * 0.95);
    const f = 40 * Math.pow(fMax / 40, (peak + 0.5) / 64);
    expect(f).toBeGreaterThan(850);
    expect(f).toBeLessThan(1180);
    expect(spectrum[peak]).toBeGreaterThan(0.6);
  });

  it("무음이면 모든 밴드가 0에 가깝다", () => {
    const a = new Analyzer(new Float32Array(sr * 2), sr);
    const { spectrum, bass } = a.getFrame(1, opts);
    expect(Math.max(...spectrum)).toBeLessThan(0.01);
    expect(bass).toBe(0);
  });

  it("같은 시각은 호출 순서와 상관없이 같은 결과를 낸다", () => {
    const sig = synth(sr, 4, (t) => 0.3 * Math.sin(2 * Math.PI * 220 * t) + 0.2 * Math.sin(2 * Math.PI * 3000 * t));
    const o = { bands: 32, smoothing: 0.6 };
    const a1 = new Analyzer(sig, sr);
    const a2 = new Analyzer(sig, sr);
    a1.getFrame(0.5, o);
    a1.getFrame(1, o);
    const x = a1.getFrame(2, o).spectrum;
    const y = a2.getFrame(2, o).spectrum;
    expect(Array.from(x)).toEqual(Array.from(y));
  });

  it("킥이 들어오는 순간 bass가 커진다", () => {
    const sig = synth(sr, 8, (t) => {
      const beat = t % 1;
      const env = Math.exp(-beat * 12);
      return 0.8 * env * Math.sin(2 * Math.PI * 60 * t) + 0.02 * Math.sin(2 * Math.PI * 2000 * t);
    });
    const a = new Analyzer(sig, sr);
    const onBeat = a.getFrame(3.03, { bands: 32, smoothing: 0 }).bass;
    const offBeat = a.getFrame(3.8, { bands: 32, smoothing: 0 }).bass;
    expect(onBeat).toBeGreaterThan(0.7);
    expect(offBeat).toBeLessThan(0.3);
  });

  it("스무딩을 켜면 소리가 끊긴 직후에 값이 천천히 내려간다", () => {
    const sig = synth(sr, 4, (t) => (t < 2 ? 0.5 * Math.sin(2 * Math.PI * 1000 * t) : 0));
    const a = new Analyzer(sig, sr);
    const raw = Math.max(...a.getFrame(2.15, { bands: 32, smoothing: 0 }).spectrum);
    const smooth = Math.max(...a.getFrame(2.15, { bands: 32, smoothing: 0.8 }).spectrum);
    expect(smooth).toBeGreaterThan(raw);
  });
});
