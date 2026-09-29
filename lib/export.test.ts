// WebCodecs를 흉내 낸 가짜 인코더로 내보내기 파이프라인(프레임 수, 오디오 길이, 페이드, 취소, MP4 구조)을 검증하는 테스트
import { createCanvas } from "@napi-rs/canvas";
import { beforeAll, describe, expect, it } from "vitest";
import { Analyzer } from "./audio";
import { exportMp4 } from "./export";
import { mergeSettings } from "./settings";

type Chunk = { type: "key" | "delta"; timestamp: number; duration: number; byteLength: number; copyTo: (b: Uint8Array) => void };
let lastFrameSrc: unknown = null;
const videoChunks: Chunk[] = [];
const audioBlocks: { timestamp: number; frames: number; first: number }[] = [];

// mp4-muxer가 instanceof로 검사하므로 실제 클래스 흉내를 낸다.
class FakeEncodedVideoChunk {}
class FakeEncodedAudioChunk {}
const mkChunk = (type: "key" | "delta", timestamp: number, duration: number, audio = false): Chunk =>
  Object.assign(audio ? new FakeEncodedAudioChunk() : new FakeEncodedVideoChunk(), {
    type,
    timestamp,
    duration,
    byteLength: 16,
    copyTo: (b: Uint8Array) => b.fill(1),
  });

beforeAll(() => {
  const g = globalThis as Record<string, unknown>;
  g.EncodedVideoChunk = FakeEncodedVideoChunk;
  g.EncodedAudioChunk = FakeEncodedAudioChunk;
  g.document = { createElement: () => createCanvas(2, 2) };
  g.VideoFrame = class {
    constructor(
      public src: unknown,
      public init: { timestamp: number; duration: number },
    ) {
      lastFrameSrc = src;
    }
    close() {}
  };
  g.AudioData = class {
    timestamp: number;
    numberOfFrames: number;
    data: Float32Array;
    constructor(init: { timestamp: number; numberOfFrames: number; data: Float32Array }) {
      this.timestamp = init.timestamp;
      this.numberOfFrames = init.numberOfFrames;
      this.data = init.data;
    }
    close() {}
  };
  g.VideoEncoder = class {
    static isConfigSupported = async () => ({ supported: true });
    encodeQueueSize = 0;
    state = "configured";
    private sent = false;
    constructor(private init: { output: (c: Chunk, m: unknown) => void }) {}
    configure() {}
    encode(f: { init: { timestamp: number; duration: number } }, o: { keyFrame: boolean }) {
      const c = mkChunk(o.keyFrame ? "key" : "delta", f.init.timestamp, f.init.duration);
      videoChunks.push(c);
      const meta = this.sent ? undefined : { decoderConfig: { codec: "avc1.64002A", description: new Uint8Array([1, 100, 0, 42, 255, 225, 0, 0, 1, 0, 0]) } };
      this.sent = true;
      this.init.output(c, meta);
    }
    async flush() {}
    close() {
      this.state = "closed";
    }
  };
  g.AudioEncoder = class {
    static isConfigSupported = async () => ({ supported: true });
    state = "configured";
    private sent = false;
    constructor(private init: { output: (c: Chunk, m: unknown) => void }) {}
    configure() {}
    encode(d: { timestamp: number; numberOfFrames: number; data: Float32Array }) {
      audioBlocks.push({ timestamp: d.timestamp, frames: d.numberOfFrames, first: d.data[1] });
      const c = mkChunk("key", d.timestamp, Math.round((d.numberOfFrames / 44100) * 1e6), true);
      const meta = this.sent ? undefined : { decoderConfig: { codec: "mp4a.40.2", numberOfChannels: 2, sampleRate: 44100, description: new Uint8Array([0x12, 0x10]) } };
      this.sent = true;
      this.init.output(c, meta);
    }
    async flush() {}
    close() {
      this.state = "closed";
    }
  };
});

function fakeBuffer(sec: number, sr = 44100, channels = 2): AudioBuffer {
  const data = Array.from({ length: channels }, () => new Float32Array(Math.round(sec * sr)).fill(0.5));
  return { sampleRate: sr, numberOfChannels: channels, length: data[0].length, duration: sec, getChannelData: (c: number) => data[c] } as unknown as AudioBuffer;
}

describe("exportMp4", () => {
  const buf = fakeBuffer(4);
  const analyzer = new Analyzer(buf.getChannelData(0), buf.sampleRate);
  const base = { buffer: buf, analyzer, assets: {} };

  it("구간과 fps에 맞는 프레임 수와 오디오 길이로 유효한 MP4 구조를 만든다", async () => {
    videoChunks.length = 0;
    audioBlocks.length = 0;
    const settings = mergeSettings({ resolution: 720, fps: 30 });
    const progress: number[] = [];
    const blob = await exportMp4({ ...base, settings, timeline: { start: 1, end: 3, fadeIn: 0, fadeOut: 0 }, onProgress: (p) => progress.push(p) });

    expect(videoChunks.length).toBe(60);
    expect(videoChunks[0].type).toBe("key");
    expect(videoChunks[59].timestamp).toBe(Math.round((59 * 1e6) / 30));
    const totalAudio = audioBlocks.reduce((a, b) => a + b.frames, 0);
    expect(totalAudio).toBe(2 * 44100);
    expect(audioBlocks[0].timestamp).toBe(0);
    expect(progress[progress.length - 1]).toBe(1);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.slice(4, 8)).toBe("ftyp");
    expect(text).toContain("moov");
    expect(text).toContain("mdat");
    expect(text).toContain("avc1");
    expect(text).toContain("mp4a");
  });

  it("페이드 인이 오디오 첫 샘플을 0에서 시작하게 한다", async () => {
    audioBlocks.length = 0;
    await exportMp4({ ...base, settings: mergeSettings({ fps: 30 }), timeline: { start: 0, end: 2, fadeIn: 1, fadeOut: 0 } });
    expect(audioBlocks[0].first).toBeLessThan(0.001);
    expect(audioBlocks[1].frames).toBeGreaterThan(0);
  });

  it("음원을 빼면 오디오 트랙 없이 영상만 만든다", async () => {
    videoChunks.length = 0;
    audioBlocks.length = 0;
    const blob = await exportMp4({ ...base, settings: mergeSettings({ fps: 30 }), timeline: { start: 0, end: 1, fadeIn: 0, fadeOut: 0 }, includeAudio: false });
    expect(videoChunks.length).toBe(30);
    expect(audioBlocks.length).toBe(0);
    const text = new TextDecoder("latin1").decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text).toContain("avc1");
    expect(text).not.toContain("mp4a");
  });

  it("합성용 단색 배경 옵션이 실제 프레임에 적용된다", async () => {
    await exportMp4({
      ...base,
      settings: mergeSettings({ fps: 30, glow: 0, progressOn: false, width: 0, height: 0 }),
      timeline: { start: 0, end: 0.5, fadeIn: 0, fadeOut: 0 },
      render: { solidBg: "#00ff00" },
    });
    const c = lastFrameSrc as { getContext: (t: string) => CanvasRenderingContext2D };
    expect(Array.from(c.getContext("2d").getImageData(10, 10, 1, 1).data)).toEqual([0, 255, 0, 255]);
  });

  it("취소하면 AbortError로 중단한다", async () => {
    const ac = new AbortController();
    const p = exportMp4({ ...base, settings: mergeSettings({}), timeline: { start: 0, end: 4, fadeIn: 0, fadeOut: 0 }, signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});
