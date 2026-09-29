// 설정과 오디오 프레임을 받아 캔버스에 한 프레임을 그리는 렌더러. 미리보기와 내보내기가 같은 함수를 쓴다.
import type { AudioFrame } from "./audio";
import { clamp, type ImageLayer, type Settings } from "./settings";

export interface Assets {
  bgImage?: CanvasImageSource;
  bgVideo?: HTMLVideoElement;
  art?: CanvasImageSource;
  logo?: CanvasImageSource;
}

type Ctx = CanvasRenderingContext2D;
type Scratch = { canvas: CanvasImageSource; ctx: Ctx };

const FONT =
  '"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif';

// 블러용 임시 캔버스 생성기. 테스트에서는 node 환경용 구현으로 교체한다.
let makeScratch = (w: number, h: number): Scratch => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { canvas: c, ctx: c.getContext("2d") as Ctx };
};
export function setScratchFactory(f: (w: number, h: number) => Scratch): void {
  makeScratch = f;
}

let scratch: (Scratch & { w: number; h: number }) | null = null;
function getScratch(w: number, h: number) {
  if (!scratch || scratch.w !== w || scratch.h !== h) {
    scratch = { w, h, ...makeScratch(w, h) };
  } else {
    scratch.ctx.clearRect(0, 0, w, h);
  }
  return scratch;
}

function srcSize(s: CanvasImageSource): [number, number] {
  const a = s as { videoWidth?: number; videoHeight?: number; naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  if (a.videoWidth) return [a.videoWidth, a.videoHeight ?? 0];
  if (a.naturalWidth) return [a.naturalWidth, a.naturalHeight ?? 0];
  return [a.width ?? 0, a.height ?? 0];
}

function drawCover(ctx: Ctx, src: CanvasImageSource, w: number, h: number, blur: number) {
  const [sw, sh] = srcSize(src);
  if (!sw || !sh) return;
  const k = Math.max(w / sw, h / sh);
  const dw = sw * k;
  const dh = sh * k;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  if (blur <= 0) {
    ctx.drawImage(src, dx, dy, dw, dh);
    return;
  }
  // 작게 줄였다가 다시 키우는 방식이라 브라우저별 ctx.filter 지원과 상관없이 같은 결과가 나온다.
  const f = Math.max(1, blur / 2);
  const tw = Math.max(2, Math.round(w / f));
  const th = Math.max(2, Math.round(h / f));
  const sc = getScratch(tw, th);
  sc.ctx.imageSmoothingQuality = "high";
  sc.ctx.drawImage(src, (dx * tw) / w, (dy * th) / h, (dw * tw) / w, (dh * th) / h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sc.canvas, 0, 0, tw, th, 0, 0, w, h);
}

function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function shiftHue(hex: string, deg: number): string {
  if (deg === 0) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  const nh = (((h + deg) % 360) + 360) % 360;
  return `hsl(${nh.toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%)`;
}

function drawBackground(ctx: Ctx, w: number, h: number, s: Settings, a: Assets) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, s.bgColor);
  g.addColorStop(1, s.bgColor2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const src = s.bgKind === "image" ? a.bgImage : s.bgKind === "video" ? a.bgVideo : undefined;
  if (src) drawCover(ctx, src, w, h, s.blur);
  if (s.dim > 0) {
    ctx.fillStyle = `rgba(0,0,0,${s.dim})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawLayer(ctx: Ctx, img: CanvasImageSource, L: ImageLayer, w: number, h: number, scale = 1) {
  const [sw, sh] = srcSize(img);
  if (!sw || !sh) return;
  const m = Math.min(w, h);
  const cx = L.x * w;
  const cy = L.y * h;
  const dw = L.size * m * scale;
  ctx.save();
  ctx.globalAlpha = L.opacity;
  if (L.radius > 0) {
    // 둥근 모서리는 정사각형으로 중앙을 잘라 채운다.
    ctx.beginPath();
    roundRectPath(ctx, cx - dw / 2, cy - dw / 2, dw, dw, dw * L.radius);
    ctx.clip();
    const k = Math.max(dw / sw, dw / sh);
    ctx.drawImage(img, cx - (sw * k) / 2, cy - (sh * k) / 2, sw * k, sh * k);
  } else {
    const dh = (dw * sh) / sw;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  }
  ctx.restore();
}

function drawWave(ctx: Ctx, w: number, h: number, s: Settings, f: AudioFrame, u: number) {
  const bw = s.width * w;
  const bh = s.height * h;
  const bass = f.bass;
  const scale = 1 + s.pulse * bass * 0.25;
  const hue = s.colorShift * bass * 90;
  const c1 = shiftHue(s.color1, hue);
  const c2 = shiftHue(s.color2, hue);

  ctx.save();
  ctx.translate(s.x * w, s.y * h);
  ctx.scale(scale, scale);

  let paint: string | CanvasGradient = c1;
  if (s.gradient) {
    const g = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    paint = g;
  }
  ctx.fillStyle = paint;
  ctx.strokeStyle = paint;
  if (s.glow > 0) {
    ctx.shadowColor = c1;
    ctx.shadowBlur = s.glow * 40 * u;
  }

  const n = s.barCount;
  const val = (i: number) => clamp(f.spectrum[i] * s.sensitivity);

  if (s.waveType === "bars" || s.waveType === "mirror") {
    const sp = bw / n;
    const barW = Math.max(1, sp * (1 - s.gap));
    const minH = s.rounded ? barW : 2 * u;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const barH = Math.max(minH, val(i) * bh);
      const x = -bw / 2 + i * sp + (sp - barW) / 2;
      const y = s.waveType === "bars" ? bh / 2 - barH : -barH / 2;
      if (s.rounded) roundRectPath(ctx, x, y, barW, barH, barW / 2);
      else ctx.rect(x, y, barW, barH);
    }
    ctx.fill();
  } else if (s.waveType === "dots") {
    const sp = bw / n;
    const r = Math.max(1, (sp * (1 - s.gap)) / 2);
    const rowH = Math.max(sp, r * 2.2);
    const maxRows = Math.max(1, Math.floor(bh / 2 / rowH));
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const cx = -bw / 2 + i * sp + sp / 2;
      const rows = Math.max(1, Math.round(val(i) * maxRows));
      for (let j = 0; j < rows; j++) {
        const dy = rowH * (j + 0.5);
        ctx.moveTo(cx + r, -dy);
        ctx.arc(cx, -dy, r, 0, Math.PI * 2);
        ctx.moveTo(cx + r, dy);
        ctx.arc(cx, dy, r, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  } else if (s.waveType === "line") {
    const pts = f.wave.length;
    const px = (i: number) => -bw / 2 + (i * bw) / (pts - 1);
    const py = (i: number) => Math.tanh(f.wave[i] * s.sensitivity * 2) * (bh / 2);
    ctx.lineWidth = Math.max(1, s.thickness * u);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(px(0), py(0));
    for (let i = 1; i < pts - 1; i++) {
      const mx = (px(i) + px(i + 1)) / 2;
      const my = (py(i) + py(i + 1)) / 2;
      ctx.quadraticCurveTo(px(i), py(i), mx, my);
    }
    ctx.lineTo(px(pts - 1), py(pts - 1));
    ctx.stroke();
  } else {
    // circle: 좌우 대칭으로 원 둘레에 막대를 세운다.
    const half = Math.min(bw, bh) / 2;
    const r0 = half * 0.6;
    const maxLen = half - r0;
    const m = n * 2;
    const step = (Math.PI * 2) / m;
    ctx.lineWidth = Math.max(1, r0 * step * (1 - s.gap));
    ctx.lineCap = s.rounded ? "round" : "butt";
    ctx.beginPath();
    for (let k = 0; k < m; k++) {
      const idx = k < n ? k : m - 1 - k;
      const len = Math.max(2 * u, val(idx) * maxLen);
      const a = -Math.PI / 2 + (k + 0.5) * step;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      ctx.moveTo(cos * r0, sin * r0);
      ctx.lineTo(cos * (r0 + len), sin * (r0 + len));
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawText(ctx: Ctx, w: number, h: number, s: Settings) {
  if (!s.title && !s.artist) return;
  const size = s.titleSize * Math.min(w, h);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = s.textColor;
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = size * 0.2;
  const x = s.textX * w;
  const y = s.textY * h;
  if (s.title) {
    ctx.font = `700 ${size}px ${FONT}`;
    ctx.fillText(s.title, x, y, w * 0.9);
  }
  if (s.artist) {
    ctx.font = `400 ${size * 0.6}px ${FONT}`;
    ctx.globalAlpha = 0.8;
    ctx.fillText(s.artist, x, y + (s.title ? size * 0.95 : 0), w * 0.9);
  }
  ctx.restore();
}

/**
 * @param t 출력 영상 기준 현재 시각(초)
 * @param outDur 출력 영상 길이(초)
 * @param fade 화면 페이드 값 (1이면 정상, 0이면 완전히 검정)
 */
export function renderFrame(
  ctx: Ctx,
  w: number,
  h: number,
  s: Settings,
  assets: Assets,
  frame: AudioFrame,
  t: number,
  outDur: number,
  fade = 1,
): void {
  const u = Math.min(w, h) / 1080;
  ctx.clearRect(0, 0, w, h);
  drawBackground(ctx, w, h, s, assets);

  if (s.art.enabled && assets.art) {
    drawLayer(ctx, assets.art, s.art, w, h, 1 + s.pulse * frame.bass * 0.08);
  }
  drawWave(ctx, w, h, s, frame, u);
  drawText(ctx, w, h, s);
  if (s.logo.enabled && assets.logo) drawLayer(ctx, assets.logo, s.logo, w, h);

  if (s.progressOn && outDur > 0) {
    const th = Math.max(2, s.progressThickness * u);
    const y = s.progressPos === "top" ? 0 : h - th;
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = s.progressColor;
    ctx.fillRect(0, y, w, th);
    ctx.globalAlpha = 1;
    ctx.fillRect(0, y, w * clamp(t / outDur), th);
    ctx.restore();
  }

  if (fade < 1) {
    ctx.fillStyle = `rgba(0,0,0,${1 - fade})`;
    ctx.fillRect(0, 0, w, h);
  }
}
