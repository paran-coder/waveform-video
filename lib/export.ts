// WebCodecs와 mp4-muxer로 브라우저 안에서 MP4를 만드는 내보내기 파이프라인
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import type { Analyzer } from "./audio";
import { seekVideo } from "./assets";
import { renderFrame, type Assets, type RenderOpts } from "./render";
import { fadeGain, getSize, type Settings, type Timeline } from "./settings";

export interface ExportOptions {
  buffer: AudioBuffer;
  analyzer: Analyzer;
  settings: Settings;
  timeline: Timeline;
  assets: Assets;
  includeAudio?: boolean; // 기본값은 true
  render?: RenderOpts; // 합성용 단색 배경 등 렌더 옵션
  onProgress?: (p: number, label: string) => void;
  signal?: AbortSignal;
}

const VIDEO_CODECS = ["avc1.64002A", "avc1.4D002A", "avc1.42E02A"];
const AUDIO_BLOCK_SEC = 0.5;

// 지원하지 않으면 사용자에게 보여줄 안내 문구를, 지원하면 null을 돌려준다.
export function checkSupport(): string | null {
  if (typeof VideoEncoder === "undefined" || typeof AudioEncoder === "undefined" || typeof VideoFrame === "undefined") {
    return "이 브라우저는 MP4 내보내기를 지원하지 않습니다. 최신 Chrome이나 Edge를 사용해 주세요.";
  }
  return null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function abortError(): DOMException {
  return new DOMException("내보내기를 취소했습니다.", "AbortError");
}

export async function exportMp4(o: ExportOptions): Promise<Blob> {
  const { buffer, analyzer, settings: s, timeline: tl, assets, onProgress, signal } = o;
  const withAudio = o.includeAudio !== false;
  const [w, h] = getSize(s.aspect, s.resolution);
  const fps = s.fps;
  const outDur = tl.end - tl.start;
  const totalFrames = Math.max(1, Math.round(outDur * fps));
  const sr = buffer.sampleRate;
  const channels = Math.min(2, buffer.numberOfChannels);

  const bitrate = Math.round(w * h * fps * 0.12);
  let videoCodec: string | null = null;
  for (const codec of VIDEO_CODECS) {
    const r = await VideoEncoder.isConfigSupported({ codec, width: w, height: h, bitrate, framerate: fps });
    if (r.supported) {
      videoCodec = codec;
      break;
    }
  }
  if (!videoCodec) throw new Error("이 브라우저에서 H.264 영상 인코딩을 사용할 수 없습니다.");

  const audioConfig = { codec: "mp4a.40.2", sampleRate: sr, numberOfChannels: channels, bitrate: 192_000 };
  if (withAudio) {
    const audioSupport = await AudioEncoder.isConfigSupported(audioConfig);
    if (!audioSupport.supported) throw new Error("이 브라우저에서 AAC 오디오 인코딩을 사용할 수 없습니다.");
  }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width: w, height: h, frameRate: fps },
    ...(withAudio ? { audio: { codec: "aac" as const, numberOfChannels: channels, sampleRate: sr } } : {}),
    fastStart: "in-memory",
  });

  let encError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (encError = e),
  });
  videoEncoder.configure({ codec: videoCodec, width: w, height: h, bitrate, framerate: fps, latencyMode: "quality" });
  const audioEncoder = withAudio
    ? new AudioEncoder({
        output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
        error: (e) => (encError = e),
      })
    : null;
  audioEncoder?.configure(audioConfig);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false }) as CanvasRenderingContext2D;

  const startSample = Math.round(tl.start * sr);
  const totalSamples = Math.round(outDur * sr);
  const blockSamples = Math.round(AUDIO_BLOCK_SEC * sr);
  let audioDone = 0;

  const encodeAudioBlock = () => {
    if (!audioEncoder) return;
    const n = Math.min(blockSamples, totalSamples - audioDone);
    const data = new Float32Array(n * channels);
    for (let c = 0; c < channels; c++) {
      const src = buffer.getChannelData(c).subarray(startSample + audioDone, startSample + audioDone + n);
      const dst = data.subarray(c * n, (c + 1) * n);
      for (let i = 0; i < n; i++) {
        const t = (audioDone + i) / sr;
        dst[i] = src[i] * fadeGain(t, outDur, tl.fadeIn, tl.fadeOut);
      }
    }
    const ad = new AudioData({
      format: "f32-planar",
      sampleRate: sr,
      numberOfFrames: n,
      numberOfChannels: channels,
      timestamp: Math.round((audioDone / sr) * 1e6),
      data,
    });
    audioEncoder.encode(ad);
    ad.close();
    audioDone += n;
  };

  const cleanup = () => {
    if (videoEncoder.state !== "closed") videoEncoder.close();
    if (audioEncoder && audioEncoder.state !== "closed") audioEncoder.close();
  };

  try {
    assets.bgVideo?.pause();
    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) throw abortError();
      if (encError) throw encError;
      const t = i / fps;
      if (s.bgKind === "video" && assets.bgVideo && !o.render?.solidBg) await seekVideo(assets.bgVideo, t);

      const frame = analyzer.getFrame(tl.start + t, { bands: s.barCount, smoothing: s.smoothing });
      renderFrame(ctx, w, h, s, assets, frame, t, outDur, fadeGain(t, outDur, tl.fadeIn, tl.fadeOut), o.render);

      const vf = new VideoFrame(canvas, {
        timestamp: Math.round((i * 1e6) / fps),
        duration: Math.round(1e6 / fps),
      });
      videoEncoder.encode(vf, { keyFrame: i % (fps * 2) === 0 });
      vf.close();

      // 영상이 1초 앞서 나가지 않도록 오디오를 같은 속도로 넣어 두 트랙이 뒤섞여 저장되게 한다.
      while (withAudio && audioDone < totalSamples && audioDone / sr < t + 1) encodeAudioBlock();

      while (videoEncoder.encodeQueueSize > 8) await sleep(2);
      if (i % 8 === 0) {
        onProgress?.(i / totalFrames, `영상 만드는 중 (${i}/${totalFrames} 프레임)`);
        await sleep(0);
      }
    }
    while (withAudio && audioDone < totalSamples) encodeAudioBlock();

    onProgress?.(0.98, "파일 마무리 중");
    await videoEncoder.flush();
    await audioEncoder?.flush();
    if (encError) throw encError;
    muxer.finalize();
    onProgress?.(1, "완료");
    return new Blob([target.buffer], { type: "video/mp4" });
  } finally {
    cleanup();
  }
}
