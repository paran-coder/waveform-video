// 파형 비디오의 설정 타입, 기본값, 내장 프리셋, 출력 해상도 계산을 담는 모듈

export type WaveType = "bars" | "mirror" | "line" | "circle" | "dots";
export type Aspect = "16:9" | "9:16" | "1:1";
export type BgKind = "color" | "image" | "video";

export interface ImageLayer {
  enabled: boolean;
  x: number; // 중심 x (0~1)
  y: number; // 중심 y (0~1)
  size: number; // 짧은 변 대비 너비 (0~1)
  opacity: number;
  radius: number; // 0은 직각, 0.5는 원
}

export interface Settings {
  aspect: Aspect;
  resolution: 720 | 1080;
  fps: 30 | 60;

  waveType: WaveType;
  barCount: number;
  gap: number;
  thickness: number;
  rounded: boolean;
  sensitivity: number;
  smoothing: number;
  glow: number;

  color1: string;
  color2: string;
  gradient: boolean;

  x: number;
  y: number;
  width: number;
  height: number;

  bgKind: BgKind;
  bgColor: string;
  bgColor2: string;
  blur: number;
  dim: number;

  title: string;
  artist: string;
  textColor: string;
  titleSize: number;
  textX: number;
  textY: number;

  progressOn: boolean;
  progressPos: "top" | "bottom";
  progressColor: string;
  progressThickness: number;

  pulse: number;
  colorShift: number;

  art: ImageLayer;
  logo: ImageLayer;
}

// 음원에 종속된 값이라 프리셋에는 넣지 않는다.
export interface Timeline {
  start: number;
  end: number;
  fadeIn: number;
  fadeOut: number;
}

export const DEFAULT_SETTINGS: Settings = {
  aspect: "16:9",
  resolution: 720,
  fps: 30,

  waveType: "bars",
  barCount: 48,
  gap: 0.35,
  thickness: 6,
  rounded: true,
  sensitivity: 1,
  smoothing: 0.5,
  glow: 0.4,

  color1: "#22d3ee",
  color2: "#a855f7",
  gradient: true,

  x: 0.5,
  y: 0.5,
  width: 0.7,
  height: 0.35,

  bgKind: "color",
  bgColor: "#0b1020",
  bgColor2: "#1e1b4b",
  blur: 12,
  dim: 0.3,

  title: "",
  artist: "",
  textColor: "#ffffff",
  titleSize: 0.05,
  textX: 0.5,
  textY: 0.82,

  progressOn: true,
  progressPos: "bottom",
  progressColor: "#22d3ee",
  progressThickness: 6,

  pulse: 0.5,
  colorShift: 0.3,

  art: { enabled: false, x: 0.5, y: 0.45, size: 0.3, opacity: 1, radius: 0.5 },
  logo: { enabled: false, x: 0.92, y: 0.1, size: 0.1, opacity: 0.9, radius: 0 },
};

export const BUILTIN_PRESETS: Record<string, Partial<Settings>> = {
  "네온 막대": {},
  "미니멀 라인": {
    waveType: "line",
    color1: "#ffffff",
    color2: "#ffffff",
    gradient: false,
    thickness: 4,
    glow: 0,
    bgColor: "#111111",
    bgColor2: "#111111",
    width: 0.8,
    height: 0.3,
    pulse: 0,
    colorShift: 0,
    progressColor: "#ffffff",
  },
  "원형 앨범": {
    waveType: "circle",
    barCount: 48,
    width: 0.5,
    height: 0.7,
    y: 0.45,
    gap: 0.4,
    art: { ...DEFAULT_SETTINGS.art, enabled: true },
    textY: 0.88,
  },
  "숏츠 세로 미러": {
    aspect: "9:16",
    waveType: "mirror",
    barCount: 40,
    width: 0.85,
    height: 0.25,
    textY: 0.72,
    titleSize: 0.06,
  },
};

export function clamp(v: number, lo = 0, hi = 1): number {
  return Math.min(hi, Math.max(lo, v));
}

// 저장된 프리셋이나 가져온 JSON에서 빠진 항목을 기본값으로 채운다.
export function mergeSettings(p: Partial<Settings>): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...p,
    art: { ...DEFAULT_SETTINGS.art, ...p.art },
    logo: { ...DEFAULT_SETTINGS.logo, ...p.logo },
  };
}

// 짧은 변이 resolution, 긴 변은 16:9 비율. 인코더 요구에 맞춰 항상 짝수.
export function getSize(aspect: Aspect, resolution: number): [number, number] {
  const short = resolution;
  const long = Math.round((resolution * 16) / 9 / 2) * 2;
  if (aspect === "16:9") return [long, short];
  if (aspect === "9:16") return [short, long];
  return [short, short];
}

export function fadeGain(t: number, dur: number, fadeIn: number, fadeOut: number): number {
  let g = 1;
  if (fadeIn > 0 && t < fadeIn) g = Math.min(g, t / fadeIn);
  if (fadeOut > 0 && t > dur - fadeOut) g = Math.min(g, (dur - t) / fadeOut);
  return clamp(g);
}
