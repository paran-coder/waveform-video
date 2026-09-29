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

export type LogoAnchor = "tl" | "tc" | "tr" | "bl" | "bc" | "br";

// 로고는 모서리 기준으로 놓는다. 화면 비율이 바뀌어도 여백이 일정하게 유지된다.
export interface LogoLayer {
  enabled: boolean;
  anchor: LogoAnchor;
  margin: number; // 짧은 변 대비 여백 (0~1)
  size: number; // 짧은 변 대비 너비 (0~1)
  opacity: number;
  radius: number;
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

  textOn: boolean;
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
  logo: LogoLayer;
}

// 프리셋에 넣지 않는 출력 옵션
export type OutputFormat = "mp4" | "key" | "png" | "mov";

export interface OutputOptions {
  includeAudio: boolean;
  format: OutputFormat; // mp4는 일반 영상, key는 단색 배경 합성용 MP4, png는 투명 PNG 시퀀스, mov는 투명 MOV 한 파일
  keyColor: "black" | "green";
}

// 투명 PNG/MOV의 프레임당 용량(KB) 추정. 720p 16:9 기준 측정값(빛 번짐 있음 72KB, 없음 31KB)에서 화소 수의 0.65제곱으로 늘린다.
export function estimateFrameKB(s: Pick<Settings, "aspect" | "resolution" | "glow">): number {
  const [w, h] = getSize(s.aspect, s.resolution);
  const base = s.glow > 0 ? 72 : 31;
  return base * Math.pow((w * h) / 921600, 0.65);
}

export const KEY_COLORS = { black: "#000000", green: "#00ff00" } as const;

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

  textOn: true,
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
  logo: { enabled: false, anchor: "tl", margin: 0.04, size: 0.12, opacity: 1, radius: 0 },
};

export interface PresetDef {
  name: string;
  patch: Partial<Settings>;
}

export const BUILTIN_PRESETS: PresetDef[] = [
  { name: "네온 막대", patch: {} },
  {
    name: "미니멀 라인",
    patch: {
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
  },
  {
    name: "원형 앨범",
    patch: {
      waveType: "circle",
      barCount: 48,
      width: 0.5,
      height: 0.7,
      y: 0.45,
      gap: 0.4,
      art: { ...DEFAULT_SETTINGS.art, enabled: true },
      textY: 0.88,
    },
  },
  {
    name: "숏츠 세로 미러",
    patch: {
      aspect: "9:16",
      waveType: "mirror",
      barCount: 40,
      width: 0.85,
      height: 0.25,
      textY: 0.72,
      titleSize: 0.06,
    },
  },
  {
    name: "레트로 선셋",
    patch: {
      waveType: "mirror",
      barCount: 56,
      gap: 0.3,
      color1: "#ff4d8d",
      color2: "#ffb347",
      glow: 0.8,
      bgColor: "#1a0b2e",
      bgColor2: "#5b1a5e",
      width: 0.8,
      height: 0.32,
      pulse: 0.7,
      colorShift: 0.2,
      progressColor: "#ff4d8d",
    },
  },
  {
    name: "로파이 카페",
    patch: {
      waveType: "dots",
      barCount: 36,
      gap: 0.25,
      color1: "#f6c177",
      color2: "#eb6f92",
      glow: 0.15,
      bgColor: "#26180f",
      bgColor2: "#3d2616",
      pulse: 0.2,
      colorShift: 0,
      textColor: "#f6e3c4",
      progressColor: "#f6c177",
    },
  },
  {
    name: "클린 화이트",
    patch: {
      waveType: "bars",
      barCount: 64,
      gap: 0.5,
      color1: "#111827",
      gradient: false,
      glow: 0,
      bgColor: "#f5f5f4",
      bgColor2: "#e7e5e4",
      dim: 0,
      textColor: "#111827",
      progressColor: "#111827",
      pulse: 0.2,
      colorShift: 0,
    },
  },
  {
    name: "불꽃 이퀄라이저",
    patch: {
      waveType: "bars",
      barCount: 32,
      gap: 0.2,
      rounded: false,
      color1: "#ef4444",
      color2: "#facc15",
      glow: 0.6,
      bgColor: "#0a0505",
      bgColor2: "#2a0a0a",
      width: 0.8,
      height: 0.46,
      y: 0.42,
      pulse: 0.8,
      colorShift: 0,
      progressColor: "#facc15",
    },
  },
  {
    name: "오로라",
    patch: {
      waveType: "mirror",
      barCount: 72,
      gap: 0.35,
      color1: "#34d399",
      color2: "#38bdf8",
      glow: 0.9,
      bgColor: "#04111f",
      bgColor2: "#0b3a4a",
      width: 0.85,
      height: 0.4,
      pulse: 0.4,
      colorShift: 0.5,
      progressColor: "#34d399",
    },
  },
  {
    name: "파스텔 원형 (정사각)",
    patch: {
      aspect: "1:1",
      waveType: "circle",
      barCount: 40,
      gap: 0.45,
      color1: "#f9a8d4",
      color2: "#c4b5fd",
      glow: 0.2,
      bgColor: "#fdf2f8",
      bgColor2: "#ede9fe",
      dim: 0,
      width: 0.8,
      height: 0.8,
      y: 0.45,
      art: { ...DEFAULT_SETTINGS.art, enabled: true },
      textColor: "#4c1d95",
      textY: 0.9,
      progressColor: "#c4b5fd",
      colorShift: 0,
    },
  },
  {
    name: "따뜻한 라인",
    patch: {
      waveType: "line",
      thickness: 3,
      color1: "#f5d7a1",
      gradient: false,
      glow: 0.1,
      bgColor: "#2b1d14",
      bgColor2: "#4a2f1c",
      width: 0.85,
      height: 0.25,
      pulse: 0,
      colorShift: 0,
      textColor: "#f5d7a1",
      progressColor: "#f5d7a1",
    },
  },
  {
    name: "인스타 정사각 막대",
    patch: {
      aspect: "1:1",
      waveType: "bars",
      barCount: 36,
      gap: 0.4,
      color1: "#fb923c",
      color2: "#f43f5e",
      glow: 0.3,
      bgColor: "#18181b",
      bgColor2: "#27272a",
      width: 0.8,
      height: 0.4,
      textY: 0.8,
      progressColor: "#fb923c",
    },
  },
  {
    name: "화이트 점 스펙트럼",
    patch: {
      waveType: "dots",
      barCount: 48,
      gap: 0.3,
      color1: "#ffffff",
      color2: "#ffffff",
      gradient: false,
      glow: 0.3,
      bgColor: "#0b0f19",
      bgColor2: "#0b0f19",
      width: 0.8,
      height: 0.4,
      pulse: 0.3,
      colorShift: 0,
      progressColor: "#ffffff",
    },
  },
];

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
