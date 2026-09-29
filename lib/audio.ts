// 음원 디코딩과 프레임별 주파수 분석(FFT)을 담당하는 모듈. 미리보기와 내보내기가 같은 결과를 내도록 상태 없이 계산한다.
import { clamp } from "./settings";

export interface AudioFrame {
  spectrum: Float32Array; // 밴드별 0~1 세기 (저음에서 고음 순)
  wave: Float32Array; // 시간 영역 파형 (-1~1)
  bass: number; // 곡 평균 대비 저음 강세 (0~1)
}

export interface FrameOptions {
  bands: number;
  smoothing: number; // 0~1
}

const FFT_SIZE = 4096;
const GRID = 240; // 분석 시각을 1/240초 격자에 맞춰 30fps, 60fps 모두 캐시가 맞도록 한다.
const MIN_DB = -70;
const MAX_DB = -15;
const F_MIN = 40;
const TAP_STEP = GRID / 30; // 스무딩 탭 간격 (1/30초)
const TAPS = 8;
const WAVE_WINDOW = 2048;
const WAVE_POINTS = 256;

export class FFT {
  private rev: Uint32Array;
  private cos: Float32Array;
  private sin: Float32Array;

  constructor(readonly n: number) {
    const bits = Math.log2(n);
    this.rev = new Uint32Array(n);
    for (let i = 1; i < n; i++) {
      this.rev[i] = (this.rev[i >> 1] >> 1) | ((i & 1) << (bits - 1));
    }
    this.cos = new Float32Array(n / 2);
    this.sin = new Float32Array(n / 2);
    for (let k = 0; k < n / 2; k++) {
      const a = (-2 * Math.PI * k) / n;
      this.cos[k] = Math.cos(a);
      this.sin[k] = Math.sin(a);
    }
  }

  transform(re: Float32Array, im: Float32Array): void {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      const j = this.rev[i];
      if (j > i) {
        const tr = re[i];
        re[i] = re[j];
        re[j] = tr;
        const ti = im[i];
        im[i] = im[j];
        im[j] = ti;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j;
          const b = a + half;
          const tr = re[b] * this.cos[k] - im[b] * this.sin[k];
          const ti = re[b] * this.sin[k] + im[b] * this.cos[k];
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
  }
}

export async function decodeAudio(file: File): Promise<AudioBuffer> {
  const ctx = new AudioContext();
  try {
    return await ctx.decodeAudioData(await file.arrayBuffer());
  } finally {
    void ctx.close();
  }
}

export class Analyzer {
  readonly duration: number;
  private fft = new FFT(FFT_SIZE);
  private window = new Float32Array(FFT_SIZE);
  private winSum = 0;
  private re = new Float32Array(FFT_SIZE);
  private im = new Float32Array(FFT_SIZE);
  private tilt = new Float32Array(FFT_SIZE / 2);
  private cache = new Map<number, Float32Array>();
  private binHz: number;
  private bassLo = 0;
  private bassHi = 1;

  constructor(
    private mono: Float32Array,
    readonly sampleRate: number,
  ) {
    this.duration = mono.length / sampleRate;
    this.binHz = sampleRate / FFT_SIZE;
    for (let i = 0; i < FFT_SIZE; i++) {
      this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
      this.winSum += this.window[i];
    }
    // 고음이 너무 작게 보이지 않도록 옥타브당 3dB 기울기를 준다.
    for (let k = 0; k < this.tilt.length; k++) {
      this.tilt[k] = 3 * Math.log2(Math.max(k * this.binHz, 20) / 1000);
    }
    this.prepareBassRange();
  }

  static fromBuffer(buf: AudioBuffer): Analyzer {
    const mono = new Float32Array(buf.length);
    const ch = buf.numberOfChannels;
    for (let c = 0; c < ch; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < mono.length; i++) mono[i] += data[i] / ch;
    }
    return new Analyzer(mono, buf.sampleRate);
  }

  private levelsAt(gridIdx: number): Float32Array {
    const hit = this.cache.get(gridIdx);
    if (hit) return hit;
    const center = Math.round((gridIdx / GRID) * this.sampleRate);
    const start = center - FFT_SIZE / 2;
    for (let i = 0; i < FFT_SIZE; i++) {
      const j = start + i;
      this.re[i] = j >= 0 && j < this.mono.length ? this.mono[j] * this.window[i] : 0;
      this.im[i] = 0;
    }
    this.fft.transform(this.re, this.im);
    const out = new Float32Array(FFT_SIZE / 2);
    for (let k = 0; k < out.length; k++) {
      const mag = (2 * Math.hypot(this.re[k], this.im[k])) / this.winSum;
      const db = 20 * Math.log10(mag + 1e-10) + this.tilt[k];
      out[k] = clamp((db - MIN_DB) / (MAX_DB - MIN_DB));
    }
    this.cache.set(gridIdx, out);
    if (this.cache.size > 40) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return out;
  }

  // 지금 값과 과거 값에 지수 감쇠를 곱한 값 중 최대를 취한다. 반응은 빠르고 떨어질 때만 천천히 내려간다.
  private smoothedLevels(t: number, smoothing: number): Float32Array {
    const g = Math.round(t * GRID);
    const cur = this.levelsAt(g);
    if (smoothing <= 0) return cur;
    const decay = 0.55 + 0.4 * smoothing;
    const out = Float32Array.from(cur);
    for (let k = 1; k <= TAPS; k++) {
      const prev = this.levelsAt(g - k * TAP_STEP);
      const w = Math.pow(decay, k);
      for (let i = 0; i < out.length; i++) {
        const v = prev[i] * w;
        if (v > out[i]) out[i] = v;
      }
    }
    return out;
  }

  private toBands(levels: Float32Array, n: number): Float32Array {
    const out = new Float32Array(n);
    const fMax = Math.min(16000, (this.sampleRate / 2) * 0.95);
    const last = levels.length - 1;
    for (let i = 0; i < n; i++) {
      const f0 = F_MIN * Math.pow(fMax / F_MIN, i / n);
      const f1 = F_MIN * Math.pow(fMax / F_MIN, (i + 1) / n);
      const x = Math.sqrt(f0 * f1) / this.binHz;
      const k = Math.min(Math.floor(x), last);
      const fr = x - Math.floor(x);
      let v = levels[k] * (1 - fr) + levels[Math.min(k + 1, last)] * fr;
      const b1 = Math.min(Math.floor(f1 / this.binHz), last);
      for (let b = Math.ceil(f0 / this.binHz); b <= b1; b++) v = Math.max(v, levels[b]);
      out[i] = v;
    }
    return out;
  }

  private bassLevel(levels: Float32Array): number {
    const k0 = Math.ceil(40 / this.binHz);
    const k1 = Math.floor(150 / this.binHz);
    let m = 0;
    for (let k = k0; k <= k1; k++) m = Math.max(m, levels[k]);
    return m;
  }

  // 곡 전체의 저음 분포에서 하위 30%와 상위 95% 값을 기준으로 삼아 비트가 올 때만 값이 커지게 한다.
  private prepareBassRange(): void {
    const vals: number[] = [];
    for (let t = 0; t < this.duration; t += 0.5) {
      vals.push(this.bassLevel(this.levelsAt(Math.round(t * GRID))));
    }
    this.cache.clear();
    if (vals.length < 4) return;
    vals.sort((a, b) => a - b);
    this.bassLo = vals[Math.floor(vals.length * 0.3)];
    this.bassHi = Math.max(vals[Math.floor(vals.length * 0.95)], this.bassLo + 0.05);
  }

  private waveAt(t: number): Float32Array {
    const start = Math.round((Math.round(t * GRID) / GRID) * this.sampleRate) - WAVE_WINDOW / 2;
    const chunk = WAVE_WINDOW / WAVE_POINTS;
    const out = new Float32Array(WAVE_POINTS);
    for (let p = 0; p < WAVE_POINTS; p++) {
      let best = 0;
      for (let j = 0; j < chunk; j++) {
        const idx = start + p * chunk + j;
        const v = idx >= 0 && idx < this.mono.length ? this.mono[idx] : 0;
        if (Math.abs(v) > Math.abs(best)) best = v;
      }
      out[p] = best;
    }
    return out;
  }

  getFrame(t: number, o: FrameOptions): AudioFrame {
    const levels = this.smoothedLevels(t, o.smoothing);
    const bass = clamp((this.bassLevel(levels) - this.bassLo) / (this.bassHi - this.bassLo));
    return { spectrum: this.toBands(levels, o.bands), wave: this.waveAt(t), bass };
  }
}

// 음원을 올리기 전에 설정을 미리 볼 수 있도록 만든 가짜 프레임
export function makeDemoFrame(t: number, bands: number): AudioFrame {
  const spectrum = new Float32Array(bands);
  for (let i = 0; i < bands; i++) {
    const base = 0.75 - (0.5 * i) / bands;
    spectrum[i] = clamp(base + 0.25 * Math.sin(t * 2.3 + i * 0.35) * Math.cos(t * 1.1 + i * 0.12));
  }
  const wave = new Float32Array(WAVE_POINTS);
  for (let p = 0; p < WAVE_POINTS; p++) {
    wave[p] = 0.35 * Math.sin(p * 0.18 + t * 3) * Math.sin(p * 0.03 + t);
  }
  return { spectrum, wave, bass: (Math.sin(t * 4) + 1) / 2 };
}
