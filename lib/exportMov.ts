// 알파 채널이 있는 투명 MOV(PNG 비디오 + PCM 오디오) 한 파일로 내보내는 파이프라인
import { MovWriter } from "./mov";
import { MAX_BYTES, TOO_BIG_MESSAGE, pngFrames, type FrameExportOptions } from "./pngFrames";
import { getSize } from "./settings";
import { pcm16, pcmChannels, pcmFrames } from "./wav";

export async function exportMov(o: FrameExportOptions): Promise<Blob> {
  const { buffer, settings: s, timeline: tl, onProgress } = o;
  const withAudio = o.includeAudio !== false;
  const [w, h] = getSize(s.aspect, s.resolution);
  const fps = s.fps;
  const outDur = tl.end - tl.start;
  const sr = buffer.sampleRate;
  const totalAudio = withAudio ? pcmFrames(buffer, tl.start, outDur) : 0;

  const writer = new MovWriter({ width: w, height: h, fps, audio: withAudio ? { channels: pcmChannels(buffer), sampleRate: sr } : undefined });

  // 영상 1초마다 오디오 1초를 이어서 넣어 두 트랙이 번갈아 저장되게 한다.
  let audioDone = 0;
  const writeAudioSecond = () => {
    const n = Math.min(sr, totalAudio - audioDone);
    if (n <= 0) return;
    writer.addAudio(pcm16(buffer, tl.start, outDur, tl.fadeIn, tl.fadeOut, audioDone, n));
    audioDone += n;
  };

  for await (const f of pngFrames(o, "투명 MOV 만드는 중")) {
    writer.addVideoFrame(f.data);
    if ((f.index + 1) % fps === 0) writeAudioSecond();
    if (writer.bytes > MAX_BYTES) throw new Error(TOO_BIG_MESSAGE);
  }
  while (audioDone < totalAudio) writeAudioSecond();

  onProgress?.(0.99, "파일 마무리 중");
  const blob = writer.finish();
  onProgress?.(1, "완료");
  return blob;
}
