// 배경이 투명한 PNG 프레임을 ZIP으로 묶어 내보내는 파이프라인. 편집 프로그램에서 이미지 시퀀스로 불러온다.
import { Zip, ZipPassThrough } from "fflate";
import type { Analyzer } from "./audio";
import { renderFrame, type Assets } from "./render";
import { fadeGain, getSize, type Settings, type Timeline } from "./settings";
import { encodeWav } from "./wav";

export interface PngExportOptions {
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
const MAX_BYTES = 1.5e9;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function exportPngSequence(o: PngExportOptions): Promise<Blob> {
  const { buffer, analyzer, settings: s, timeline: tl, assets, onProgress, signal } = o;
  const withAudio = o.includeAudio !== false;
  const [w, h] = getSize(s.aspect, s.resolution);
  const fps = s.fps;
  const outDur = tl.end - tl.start;
  const total = Math.max(1, Math.round(outDur * fps));
  const digits = Math.max(5, String(total).length);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

  const parts: BlobPart[] = [];
  let zipError: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) zipError = err;
    else parts.push(chunk as BlobPart);
  });
  let bytes = 0;
  const add = (name: string, data: Uint8Array) => {
    bytes += data.length;
    if (bytes > MAX_BYTES) {
      throw new Error("파일이 너무 커졌습니다. 구간 자르기로 길이를 줄이거나 해상도를 낮춰 주세요.");
    }
    const f = new ZipPassThrough(name);
    zip.add(f);
    f.push(data, true);
  };

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) throw new DOMException("내보내기를 취소했습니다.", "AbortError");
    if (zipError) throw zipError;
    const t = i / fps;
    const frame = analyzer.getFrame(tl.start + t, { bands: s.barCount, smoothing: s.smoothing });
    renderFrame(ctx, w, h, s, assets, frame, t, outDur, fadeGain(t, outDur, tl.fadeIn, tl.fadeOut), { transparent: true });
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!blob) throw new Error("PNG 이미지를 만들 수 없습니다.");
    add(`frames/waveform_${String(i + 1).padStart(digits, "0")}.png`, new Uint8Array(await blob.arrayBuffer()));
    if (i % 4 === 0) {
      onProgress?.(i / total, `PNG 만드는 중 (${i}/${total} 프레임)`);
      await sleep(0);
    }
  }

  if (withAudio) {
    onProgress?.(0.97, "오디오 파일 만드는 중");
    add("audio.wav", encodeWav(buffer, tl.start, outDur, tl.fadeIn, tl.fadeOut));
  }
  const readme = [
    "파형 영상 PNG 시퀀스",
    "",
    `프레임레이트: ${fps}fps`,
    `해상도: ${w}x${h}`,
    `프레임 수: ${total}`,
    "",
    "불러오는 방법",
    "- 프리미어 프로: 파일 > 가져오기에서 frames 폴더의 첫 번째 PNG를 고르고 '이미지 시퀀스'를 체크합니다.",
    "- 다빈치 리졸브: 미디어 풀로 frames 폴더를 끌어다 놓으면 하나의 클립으로 인식합니다.",
    "- 애프터 이펙트: 가져오기에서 'PNG 시퀀스'를 체크합니다.",
    "- 가져온 뒤 프레임레이트가 위 값과 같은지 확인하세요.",
    withAudio ? "- audio.wav는 영상과 길이가 같으니 타임라인 시작점에 맞춰 놓으세요." : "",
  ].join("\n");
  add("README.txt", new TextEncoder().encode(readme));

  zip.end();
  if (zipError) throw zipError;
  onProgress?.(1, "완료");
  return new Blob(parts, { type: "application/zip" });
}
