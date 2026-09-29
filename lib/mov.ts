// 알파 채널을 담을 수 있는 QuickTime MOV(PNG 비디오 + 16비트 PCM 오디오)를 만드는 최소 구현. 구조는 ffmpeg가 만든 MOV를 따른다.

export interface MovOptions {
  width: number;
  height: number;
  fps: number;
  audio?: { channels: number; sampleRate: number };
}

const be16 = (n: number) => Uint8Array.of(n >>> 8, n);
const be32 = (n: number) => Uint8Array.of(n >>> 24, n >>> 16, n >>> 8, n);
const fourcc = (s: string) => Uint8Array.of(...[...s].map((c) => c.charCodeAt(0)));
const zeros = (n: number) => new Uint8Array(n);
const pascal = (s: string, total: number) => {
  const out = zeros(total);
  const b = new TextEncoder().encode(s).slice(0, total - 1);
  out[0] = b.length;
  out.set(b, 1);
  return out;
};

function concat(...arrs: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

const box = (type: string, ...p: Uint8Array[]) => {
  const body = concat(...p);
  return concat(be32(8 + body.length), fourcc(type), body);
};
const fullBox = (type: string, flags: number, ...p: Uint8Array[]) => box(type, be32(flags), ...p);

const MATRIX = concat(be32(0x00010000), be32(0), be32(0), be32(0), be32(0x00010000), be32(0), be32(0), be32(0), be32(0x40000000));
const dinf = () => box("dinf", fullBox("dref", 0, be32(1), fullBox("url ", 1)));
const dataHandler = () => fullBox("hdlr", 0, fourcc("dhlr"), fourcc("url "), be32(0), be32(0), be32(0), pascal("DataHandler", 12));

function hdlr(sub: string, name: string) {
  const n = new TextEncoder().encode(name);
  return fullBox("hdlr", 0, fourcc("mhlr"), fourcc(sub), be32(0), be32(0), be32(0), Uint8Array.of(n.length), n);
}

function tkhd(id: number, durMs: number, volume: number, w: number, h: number) {
  return fullBox("tkhd", 3, be32(0), be32(0), be32(id), be32(0), be32(durMs), zeros(8), be16(0), be16(0), be16(volume), be16(0), MATRIX, be32(w * 65536), be32(h * 65536));
}

function mdhd(timescale: number, duration: number) {
  return fullBox("mdhd", 0, be32(0), be32(0), be32(timescale), be32(duration), be16(0x7fff), be16(0));
}

const stts = (count: number, delta: number) => fullBox("stts", 0, be32(1), be32(count), be32(delta));
const stco = (offsets: number[]) => fullBox("stco", 0, be32(offsets.length), ...offsets.map(be32));

export class MovWriter {
  private parts: BlobPart[] = [];
  private pending: Uint8Array[] = [];
  private pendingBytes = 0;
  private pos = 0; // mdat 데이터 시작점 기준 위치
  private videoSizes: number[] = [];
  private videoOffsets: number[] = [];
  private audioOffsets: number[] = [];
  private audioChunkFrames: number[] = [];

  constructor(private o: MovOptions) {
    if (o.audio && o.audio.sampleRate > 65535) {
      throw new Error("샘플레이트가 너무 높아 MOV에 넣을 수 없습니다.");
    }
  }

  get bytes(): number {
    return this.pos;
  }

  private write(data: Uint8Array) {
    this.pending.push(data);
    this.pendingBytes += data.length;
    this.pos += data.length;
    // 메모리를 아끼도록 일정량마다 Blob으로 넘긴다. 브라우저가 필요하면 디스크로 내보낼 수 있다.
    if (this.pendingBytes > 32e6) this.flush();
  }

  private flush() {
    if (this.pending.length) {
      this.parts.push(new Blob(this.pending as BlobPart[]));
      this.pending = [];
      this.pendingBytes = 0;
    }
  }

  addVideoFrame(png: Uint8Array): void {
    this.videoOffsets.push(this.pos);
    this.videoSizes.push(png.length);
    this.write(png);
  }

  // 16비트 리틀엔디언 인터리브 PCM
  addAudio(pcm: Uint8Array): void {
    const a = this.o.audio;
    if (!a || pcm.length === 0) return;
    this.audioOffsets.push(this.pos);
    this.audioChunkFrames.push(pcm.length / (a.channels * 2));
    this.write(pcm);
  }

  finish(): Blob {
    this.flush();
    const { width, height, fps, audio } = this.o;
    const ftyp = box("ftyp", fourcc("qt  "), be32(0), fourcc("qt  "));
    if (this.pos + 8 > 0xffffffff) throw new Error("파일이 4GB를 넘어 저장할 수 없습니다.");
    const mdatHeader = concat(be32(this.pos + 8), fourcc("mdat"));
    const base = ftyp.length + 8;

    const nVideo = this.videoSizes.length;
    const vScale = fps * 512;
    const vDurMs = Math.round((nVideo / fps) * 1000);

    const stsd = fullBox(
      "stsd",
      0,
      be32(1),
      box(
        "png ",
        zeros(6),
        be16(1),
        be16(0),
        be16(0),
        fourcc("wfvd"),
        be32(512),
        be32(512),
        be16(width),
        be16(height),
        be32(0x00480000),
        be32(0x00480000),
        be32(0),
        be16(1),
        pascal("waveform-video png", 32),
        be16(32), // 깊이 32는 알파 채널이 있다는 뜻
        be16(0xffff),
        box("fiel", Uint8Array.of(1, 0)),
        box("pasp", be32(1), be32(1)),
      ),
    );
    const videoTrak = box(
      "trak",
      tkhd(1, vDurMs, 0, width, height),
      box(
        "mdia",
        mdhd(vScale, nVideo * 512),
        hdlr("vide", "VideoHandler"),
        box(
          "minf",
          fullBox("vmhd", 1, zeros(8)),
          dataHandler(),
          dinf(),
          box(
            "stbl",
            stsd,
            stts(nVideo, 512),
            fullBox("stsc", 0, be32(1), be32(1), be32(1), be32(1)),
            fullBox("stsz", 0, be32(0), be32(nVideo), ...this.videoSizes.map(be32)),
            stco(this.videoOffsets.map((o) => base + o)),
          ),
        ),
      ),
    );

    const traks = [videoTrak];
    let durMs = vDurMs;
    if (audio && this.audioOffsets.length) {
      const totalFrames = this.audioChunkFrames.reduce((a, b) => a + b, 0);
      const aDurMs = Math.round((totalFrames / audio.sampleRate) * 1000);
      durMs = Math.max(durMs, aDurMs);
      // 같은 크기의 chunk가 이어지는 구간은 한 줄로 합친다.
      const stscEntries: number[] = [];
      let prev = -1;
      this.audioChunkFrames.forEach((n, i) => {
        if (n !== prev) stscEntries.push(i + 1, n, 1);
        prev = n;
      });
      const layout = audio.channels === 1 ? 0x00640001 : 0x00650002;
      const audioStsd = fullBox(
        "stsd",
        0,
        be32(1),
        box(
          "sowt",
          zeros(6),
          be16(1),
          be16(0),
          be16(0),
          be32(0),
          be16(audio.channels),
          be16(16),
          be16(0),
          be16(0),
          be32(audio.sampleRate * 65536),
          fullBox("chan", 0, be32(layout), be32(0), be32(0)),
        ),
      );
      traks.push(
        box(
          "trak",
          tkhd(2, aDurMs, 0x0100, 0, 0),
          box(
            "mdia",
            mdhd(audio.sampleRate, totalFrames),
            hdlr("soun", "SoundHandler"),
            box(
              "minf",
              fullBox("smhd", 0, be32(0)),
              dataHandler(),
              dinf(),
              box(
                "stbl",
                audioStsd,
                stts(totalFrames, 1),
                fullBox("stsc", 0, be32(stscEntries.length / 3), ...stscEntries.map(be32)),
                fullBox("stsz", 0, be32(audio.channels * 2), be32(totalFrames)),
                stco(this.audioOffsets.map((o) => base + o)),
              ),
            ),
          ),
        ),
      );
    }

    const mvhd = fullBox("mvhd", 0, be32(0), be32(0), be32(1000), be32(durMs), be32(0x00010000), be16(0x0100), zeros(10), MATRIX, zeros(24), be32(traks.length + 1));
    const moov = box("moov", mvhd, ...traks);
    return new Blob([ftyp, mdatHeader, ...this.parts, moov] as BlobPart[], { type: "video/quicktime" });
  }
}
