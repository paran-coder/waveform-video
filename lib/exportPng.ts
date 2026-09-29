// 배경이 투명한 PNG 프레임을 ZIP으로 묶어 내보내는 파이프라인. 편집 프로그램에서 이미지 시퀀스로 불러온다.
import { Zip, ZipPassThrough } from "fflate";
import { MAX_BYTES, TOO_BIG_MESSAGE, pngFrames, type FrameExportOptions } from "./pngFrames";
import { getSize } from "./settings";
import { encodeWav } from "./wav";

export type PngExportOptions = FrameExportOptions;

export async function exportPngSequence(o: PngExportOptions): Promise<Blob> {
  const { buffer, settings: s, timeline: tl, onProgress } = o;
  const withAudio = o.includeAudio !== false;
  const [w, h] = getSize(s.aspect, s.resolution);
  const outDur = tl.end - tl.start;

  const parts: BlobPart[] = [];
  let zipError: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) zipError = err;
    else parts.push(chunk as BlobPart);
  });
  let bytes = 0;
  const add = (name: string, data: Uint8Array) => {
    bytes += data.length;
    if (bytes > MAX_BYTES) throw new Error(TOO_BIG_MESSAGE);
    const f = new ZipPassThrough(name);
    zip.add(f);
    f.push(data, true);
  };

  let total = 0;
  let digits = 5;
  for await (const f of pngFrames(o)) {
    if (zipError) throw zipError;
    total = f.total;
    digits = Math.max(5, String(f.total).length);
    add(`frames/waveform_${String(f.index + 1).padStart(digits, "0")}.png`, f.data);
  }

  if (withAudio) {
    onProgress?.(0.97, "오디오 파일 만드는 중");
    add("audio.wav", encodeWav(buffer, tl.start, outDur, tl.fadeIn, tl.fadeOut));
  }
  const readme = [
    "파형 영상 PNG 시퀀스",
    "",
    `프레임레이트: ${s.fps}fps`,
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
