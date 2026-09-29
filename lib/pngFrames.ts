// 배경이 투명한 PNG 프레임을 순서대로 만들어 내는 공용 생성기 (PNG 시퀀스와 MOV 내보내기가 함께 쓴다)
import type { Analyzer } from "./audio";
import { renderFrame, type Assets } from "./render";
import { fadeGain, getSize, type Settings, type Timeline } from "./settings";

export interface FrameExportOptions {
  buffer: AudioBuffer;
  analyzer: Analyzer;
  settings: Settings;
  timeline: Timeline;
  assets: Assets;
  includeAudio?: boolean;
  onProgress?: (p: number, label: string) => void;
  signal?: AbortSignal;
}

// 브라우저 메모리를 보호하기 위한 상한 (약 1.5GB)
export const MAX_BYTES = 1.5e9;
export const TOO_BIG_MESSAGE = "파일이 너무 커졌습니다. 구간 자르기로 길이를 줄이거나 해상도를 낮춰 주세요.";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function frameCount(o: Pick<FrameExportOptions, "settings" | "timeline">): number {
  return Math.max(1, Math.round((o.timeline.end - o.timeline.start) * o.settings.fps));
}

export async function* pngFrames(o: FrameExportOptions, label = "PNG 만드는 중"): AsyncGenerator<{ index: number; total: number; data: Uint8Array }> {
  const { analyzer, settings: s, timeline: tl, assets, onProgress, signal } = o;
  const [w, h] = getSize(s.aspect, s.resolution);
  const fps = s.fps;
  const outDur = tl.end - tl.start;
  const total = frameCount(o);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw new DOMException("내보내기를 취소했습니다.", "AbortError");
    const t = i / fps;
    const frame = analyzer.getFrame(tl.start + t, { bands: s.barCount, smoothing: s.smoothing });
    renderFrame(ctx, w, h, s, assets, frame, t, outDur, fadeGain(t, outDur, tl.fadeIn, tl.fadeOut), { transparent: true });
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!blob) throw new Error("PNG 이미지를 만들 수 없습니다.");
    yield { index: i, total, data: new Uint8Array(await blob.arrayBuffer()) };
    if (i % 4 === 0) {
      onProgress?.(i / total, `${label} (${i}/${total} 프레임)`);
      await sleep(0);
    }
  }
}
