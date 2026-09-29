"use client";
// 모든 설정을 탭으로 묶어 보여 주는 패널 (파형, 화면, 글자·이미지, 오디오, 프리셋, 내보내기)
import { useEffect, useRef, useState, type ReactNode } from "react";
import { makeDemoFrame } from "@/lib/audio";
import { renderFrame } from "@/lib/render";
import {
  BUILTIN_PRESETS,
  estimateFrameKB,
  getSize,
  mergeSettings,
  type Aspect,
  type BgKind,
  type ImageLayer,
  type LogoAnchor,
  type LogoLayer,
  type OutputFormat,
  type OutputOptions,
  type Settings,
  type Timeline,
  type WaveType,
} from "@/lib/settings";
import { Button, ColorField, FileRow, Group, Notice, Segmented, Slider, Switch, TextField, TwoCol } from "./ui";

export type AssetKind = "bgImage" | "bgVideo" | "art" | "logo";
type TabId = "wave" | "screen" | "text" | "audio" | "preset" | "export";

const TABS: { id: TabId; label: string }[] = [
  { id: "wave", label: "파형" },
  { id: "screen", label: "화면" },
  { id: "text", label: "글자·이미지" },
  { id: "audio", label: "오디오" },
  { id: "preset", label: "프리셋" },
  { id: "export", label: "내보내기" },
];

interface Props {
  s: Settings;
  set: (p: Partial<Settings>) => void;
  setArt: (p: Partial<ImageLayer>) => void;
  setLogo: (p: Partial<LogoLayer>) => void;
  onAsset: (kind: AssetKind, f: File) => void;
  assetNames: Partial<Record<AssetKind, string>>;
  audioDuration: number | null;
  outDuration: number;
  tl: Timeline;
  setTl: (p: Partial<Timeline>) => void;
  out: OutputOptions;
  setOut: (p: Partial<OutputOptions>) => void;
  presets: Record<string, Settings>;
  onSavePreset: (name: string) => void;
  onLoadPreset: (p: Partial<Settings>) => void;
  onDeletePreset: (name: string) => void;
  onExportJson: () => void;
  onImportJson: (f: File) => void;
  supportMsg: string | null;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (v: number) => `${v.toFixed(1)}초`;
const mmss = (t: number) => `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, "0")}`;

function WaveIcon({ type }: { type: WaveType }) {
  const common = { viewBox: "0 0 24 24", className: "h-7 w-7", "aria-hidden": true } as const;
  if (type === "bars")
    return (
      <svg {...common} fill="currentColor">
        <rect x="3" y="12" width="3.5" height="8" rx="1.7" />
        <rect x="10.2" y="5" width="3.5" height="15" rx="1.7" />
        <rect x="17.5" y="9" width="3.5" height="11" rx="1.7" />
      </svg>
    );
  if (type === "mirror")
    return (
      <svg {...common} fill="currentColor">
        <rect x="3" y="8" width="3.5" height="8" rx="1.7" />
        <rect x="10.2" y="4" width="3.5" height="16" rx="1.7" />
        <rect x="17.5" y="7" width="3.5" height="10" rx="1.7" />
      </svg>
    );
  if (type === "line")
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <path d="M2 12c2-7 4-7 6 0s4 7 6 0 4-7 6 0" />
      </svg>
    );
  if (type === "circle")
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
      </svg>
    );
  return (
    <svg {...common} fill="currentColor">
      {[5, 12, 19].flatMap((x) => [6, 12, 18].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.9" />))}
    </svg>
  );
}

const WAVE_TYPES: { value: WaveType; label: string }[] = [
  { value: "bars", label: "막대" },
  { value: "mirror", label: "미러" },
  { value: "line", label: "라인" },
  { value: "circle", label: "원형" },
  { value: "dots", label: "점" },
];

function WavePicker({ value, onChange }: { value: WaveType; onChange: (v: WaveType) => void }) {
  return (
    <div role="radiogroup" aria-label="파형 종류" className="grid grid-cols-5 gap-2">
      {WAVE_TYPES.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(t.value)}
            className={`flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-1 text-sm font-medium ring-1 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              on ? "bg-accent text-accent-ink ring-accent" : "bg-surface-2 text-ink-2 ring-line hover:text-ink"
            }`}
          >
            <WaveIcon type={t.value} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// 프리셋을 작은 캔버스에 예시 파형으로 미리 그려 보여 준다.
function PresetThumb(props: { name: string; settings: Settings; onApply: () => void; onDelete?: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { settings } = props;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const [fw, fh] = getSize(settings.aspect, 720);
    const k = 108 / Math.min(fw, fh);
    const w = Math.round((fw * k) / 2) * 2;
    const h = Math.round((fh * k) / 2) * 2;
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const demo = { ...settings, title: "", artist: "", art: { ...settings.art, enabled: false }, logo: { ...settings.logo, enabled: false } };
    renderFrame(ctx, w, h, demo, {}, makeDemoFrame(1.3, settings.barCount), 1.3, 10, 1);
  }, [settings]);
  return (
    <div className="overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line transition-shadow duration-200 hover:ring-accent">
      <button
        type="button"
        onClick={props.onApply}
        aria-label={`${props.name} 프리셋 적용`}
        className="block w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
      >
        <span className="flex aspect-video items-center justify-center bg-black">
          <canvas ref={ref} className="h-full w-auto max-w-full" />
        </span>
        <span className="block px-3 py-2.5 text-[15px] font-medium text-ink">{props.name}</span>
      </button>
      {props.onDelete && (
        <button
          type="button"
          onClick={props.onDelete}
          className="min-h-11 w-full cursor-pointer border-t border-line text-[15px] text-danger transition-colors duration-200 hover:bg-[#3a1f24] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
        >
          삭제
        </button>
      )}
    </div>
  );
}

const ANCHORS: { value: LogoAnchor; label: string }[] = [
  { value: "tl", label: "왼쪽 위" },
  { value: "tc", label: "가운데 위" },
  { value: "tr", label: "오른쪽 위" },
  { value: "bl", label: "왼쪽 아래" },
  { value: "bc", label: "가운데 아래" },
  { value: "br", label: "오른쪽 아래" },
];

export default function SettingsPanel(p: Props) {
  const { s, set, tl, setTl } = p;
  const [tab, setTab] = useState<TabId>("wave");
  const [presetName, setPresetName] = useState("");
  const dur = p.audioDuration;
  const fadeMax = dur ? Math.max(0.5, Math.min(8, p.outDuration / 2)) : 5;
  const [ow, oh] = getSize(s.aspect, s.resolution);

  const wave: ReactNode = (
    <>
      <Group title="종류">
        <WavePicker value={s.waveType} onChange={(v) => set({ waveType: v })} />
      </Group>
      <Group title="모양" hint="막대 개수와 간격은 라인에는 적용되지 않고, 선 굵기는 라인에만 적용됩니다.">
        <TwoCol>
          <Slider label="막대 개수" value={s.barCount} min={8} max={128} step={1} onChange={(v) => set({ barCount: v })} />
          <Slider label="막대 간격" value={s.gap} min={0} max={0.9} step={0.01} format={pct} onChange={(v) => set({ gap: v })} />
          <Slider label="선 굵기" value={s.thickness} min={1} max={30} step={1} onChange={(v) => set({ thickness: v })} />
          <Slider label="민감도" value={s.sensitivity} min={0.3} max={2.5} step={0.05} onChange={(v) => set({ sensitivity: v })} />
          <Slider label="부드러움" value={s.smoothing} min={0} max={1} step={0.05} format={pct} onChange={(v) => set({ smoothing: v })} />
          <Slider label="빛 번짐" value={s.glow} min={0} max={1} step={0.05} format={pct} onChange={(v) => set({ glow: v })} />
        </TwoCol>
        <Switch label="둥근 끝" checked={s.rounded} onChange={(v) => set({ rounded: v })} />
      </Group>
      <Group title="색">
        <Switch label="그라데이션" checked={s.gradient} onChange={(v) => set({ gradient: v })} />
        <TwoCol>
          <ColorField label={s.gradient ? "시작 색" : "색"} value={s.color1} onChange={(v) => set({ color1: v })} />
          {s.gradient && <ColorField label="끝 색" value={s.color2} onChange={(v) => set({ color2: v })} />}
        </TwoCol>
      </Group>
      <Group title="위치와 크기">
        <TwoCol>
          <Slider label="가로 위치" value={s.x} min={0} max={1} step={0.01} format={pct} onChange={(v) => set({ x: v })} />
          <Slider label="세로 위치" value={s.y} min={0} max={1} step={0.01} format={pct} onChange={(v) => set({ y: v })} />
          <Slider label="너비" value={s.width} min={0.1} max={1} step={0.01} format={pct} onChange={(v) => set({ width: v })} />
          <Slider label="높이" value={s.height} min={0.05} max={1} step={0.01} format={pct} onChange={(v) => set({ height: v })} />
        </TwoCol>
      </Group>
      <Group title="저음 반응" hint="비트가 강할 때 파형이 커지거나 색이 바뀝니다. 음원을 올려야 확인할 수 있어요.">
        <TwoCol>
          <Slider label="크기 펄스" value={s.pulse} min={0} max={1} step={0.05} format={pct} onChange={(v) => set({ pulse: v })} />
          <Slider label="색 변화" value={s.colorShift} min={0} max={1} step={0.05} format={pct} onChange={(v) => set({ colorShift: v })} />
        </TwoCol>
      </Group>
    </>
  );

  const screen: ReactNode = (
    <>
      <Group title="화면 비율">
        <Segmented<Aspect>
          label="비율"
          value={s.aspect}
          onChange={(v) => set({ aspect: v })}
          options={[
            { value: "16:9", label: "16:9 가로" },
            { value: "9:16", label: "9:16 세로" },
            { value: "1:1", label: "1:1 정사각" },
          ]}
        />
      </Group>
      <Group title="배경">
        {p.out.format !== "mp4" && (
          <Notice tone="info">지금은 합성용 출력이라 배경 설정이 결과물에 적용되지 않습니다. 내보내기 탭에서 형식을 바꿀 수 있어요.</Notice>
        )}
        <Segmented<BgKind>
          label="배경 종류"
          value={s.bgKind}
          onChange={(v) => set({ bgKind: v })}
          options={[
            { value: "color", label: "색" },
            { value: "image", label: "이미지" },
            { value: "video", label: "영상" },
          ]}
        />
        {s.bgKind === "image" && (
          <FileRow label="이미지 선택" accept="image/*" fileName={p.assetNames.bgImage} onFile={(f) => p.onAsset("bgImage", f)} />
        )}
        {s.bgKind === "video" && (
          <FileRow label="영상 선택" accept="video/*" fileName={p.assetNames.bgVideo} onFile={(f) => p.onAsset("bgVideo", f)} />
        )}
        <TwoCol>
          <ColorField label="배경색 (위)" value={s.bgColor} onChange={(v) => set({ bgColor: v })} />
          <ColorField label="배경색 (아래)" value={s.bgColor2} onChange={(v) => set({ bgColor2: v })} />
          <Slider label="블러" value={s.blur} min={0} max={40} step={1} onChange={(v) => set({ blur: v })} />
          <Slider label="어둡게" value={s.dim} min={0} max={0.9} step={0.01} format={pct} onChange={(v) => set({ dim: v })} />
        </TwoCol>
      </Group>
      <Group title="진행바">
        <Switch label="진행바 표시" checked={s.progressOn} onChange={(v) => set({ progressOn: v })} />
        {s.progressOn && (
          <>
            <Segmented<"top" | "bottom">
              label="위치"
              value={s.progressPos}
              onChange={(v) => set({ progressPos: v })}
              options={[
                { value: "bottom", label: "아래" },
                { value: "top", label: "위" },
              ]}
            />
            <TwoCol>
              <ColorField label="색" value={s.progressColor} onChange={(v) => set({ progressColor: v })} />
              <Slider label="두께" value={s.progressThickness} min={2} max={30} step={1} onChange={(v) => set({ progressThickness: v })} />
            </TwoCol>
          </>
        )}
      </Group>
    </>
  );

  const text: ReactNode = (
    <>
      <Group title="제목·아티스트" hint="곡 제목과 아티스트 이름을 화면에 글자로 보여 줍니다.">
        <Switch label="제목·아티스트 표시" checked={s.textOn} onChange={(v) => set({ textOn: v })} />
        <TwoCol>
          <TextField label="제목" value={s.title} placeholder="곡 제목" disabled={!s.textOn} onChange={(v) => set({ title: v })} />
          <TextField label="아티스트" value={s.artist} placeholder="아티스트 이름" disabled={!s.textOn} onChange={(v) => set({ artist: v })} />
        </TwoCol>
        <ColorField label="글자색" value={s.textColor} onChange={(v) => set({ textColor: v })} />
        <TwoCol>
          <Slider label="글자 크기" value={s.titleSize} min={0.02} max={0.15} step={0.005} format={pct} onChange={(v) => set({ titleSize: v })} />
          <span className="hidden sm:block" />
          <Slider label="가로 위치" value={s.textX} min={0} max={1} step={0.01} format={pct} onChange={(v) => set({ textX: v })} />
          <Slider label="세로 위치" value={s.textY} min={0} max={1} step={0.01} format={pct} onChange={(v) => set({ textY: v })} />
        </TwoCol>
      </Group>
      <Group title="앨범 아트" hint="원형 파형 가운데에 두면 잘 어울립니다.">
        <FileRow label="이미지 선택" accept="image/*" fileName={p.assetNames.art} onFile={(f) => p.onAsset("art", f)} />
        <Switch label="앨범 아트 표시" checked={s.art.enabled} onChange={(v) => p.setArt({ enabled: v })} />
        <TwoCol>
          <Slider label="가로 위치" value={s.art.x} min={0} max={1} step={0.01} format={pct} onChange={(v) => p.setArt({ x: v })} />
          <Slider label="세로 위치" value={s.art.y} min={0} max={1} step={0.01} format={pct} onChange={(v) => p.setArt({ y: v })} />
          <Slider label="크기" value={s.art.size} min={0.05} max={1} step={0.01} format={pct} onChange={(v) => p.setArt({ size: v })} />
          <Slider label="투명도" value={s.art.opacity} min={0.1} max={1} step={0.01} format={pct} onChange={(v) => p.setArt({ opacity: v })} />
          <Slider label="모서리 둥글기 (50%는 원)" value={s.art.radius} min={0} max={0.5} step={0.01} format={pct} onChange={(v) => p.setArt({ radius: v })} />
        </TwoCol>
      </Group>
      <Group title="로고" hint="모서리를 고르고 여백만 정하면 화면 비율이 바뀌어도 같은 위치에 놓입니다.">
        <FileRow label="이미지 선택" accept="image/*" fileName={p.assetNames.logo} onFile={(f) => p.onAsset("logo", f)} />
        <Switch label="로고 표시" checked={s.logo.enabled} onChange={(v) => p.setLogo({ enabled: v })} />
        <Segmented<LogoAnchor> label="위치" value={s.logo.anchor} cols={3} options={ANCHORS} onChange={(v) => p.setLogo({ anchor: v })} />
        <TwoCol>
          <Slider label="여백" value={s.logo.margin} min={0} max={0.2} step={0.005} format={pct} onChange={(v) => p.setLogo({ margin: v })} />
          <Slider label="크기" value={s.logo.size} min={0.03} max={0.6} step={0.01} format={pct} onChange={(v) => p.setLogo({ size: v })} />
          <Slider label="투명도" value={s.logo.opacity} min={0.1} max={1} step={0.01} format={pct} onChange={(v) => p.setLogo({ opacity: v })} />
          <Slider label="모서리 둥글기" value={s.logo.radius} min={0} max={0.5} step={0.01} format={pct} onChange={(v) => p.setLogo({ radius: v })} />
        </TwoCol>
      </Group>
    </>
  );

  const audio: ReactNode = dur ? (
    <>
      <Group title="구간 자르기" hint={`사용할 구간 ${mmss(p.outDuration)} (전체 ${mmss(dur)})`}>
        <TwoCol>
          <Slider label="시작" value={tl.start} min={0} max={Math.max(0, tl.end - 1)} step={0.1} format={sec} onChange={(v) => setTl({ start: v })} />
          <Slider label="끝" value={tl.end} min={Math.min(dur, tl.start + 1)} max={dur} step={0.1} format={sec} onChange={(v) => setTl({ end: v })} />
        </TwoCol>
      </Group>
      <Group title="페이드" hint="화면과 소리가 함께 서서히 나타나고 사라집니다.">
        <TwoCol>
          <Slider label="페이드 인" value={tl.fadeIn} min={0} max={fadeMax} step={0.1} format={sec} onChange={(v) => setTl({ fadeIn: v })} />
          <Slider label="페이드 아웃" value={tl.fadeOut} min={0} max={fadeMax} step={0.1} format={sec} onChange={(v) => setTl({ fadeOut: v })} />
        </TwoCol>
      </Group>
    </>
  ) : (
    <Notice tone="info">음원을 올리면 구간 자르기와 페이드를 설정할 수 있습니다.</Notice>
  );

  const userPresets = Object.entries(p.presets);
  const preset: ReactNode = (
    <>
      <Group title="기본 프리셋" hint="누르면 바로 적용됩니다. 제목·아티스트와 로고는 그대로 유지돼요.">
        <div className="grid grid-cols-2 gap-3">
          {BUILTIN_PRESETS.map((b) => (
            <PresetThumb key={b.name} name={b.name} settings={mergeSettings(b.patch)} onApply={() => p.onLoadPreset(b.patch)} />
          ))}
        </div>
      </Group>
      <Group title="내 프리셋">
        {userPresets.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {userPresets.map(([name, ps]) => (
              <PresetThumb key={name} name={name} settings={mergeSettings(ps)} onApply={() => p.onLoadPreset(ps)} onDelete={() => p.onDeletePreset(name)} />
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <TextField label="현재 설정을 저장" value={presetName} placeholder="프리셋 이름" onChange={setPresetName} />
          </div>
          <div className="self-end">
            <Button
              kind="primary"
              disabled={!presetName.trim()}
              onClick={() => {
                p.onSavePreset(presetName.trim());
                setPresetName("");
              }}
            >
              저장
            </Button>
          </div>
        </div>
      </Group>
      <Group title="설정 파일" hint="다른 기기로 옮기거나 백업할 때 쓰세요.">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={p.onExportJson}>설정 파일로 저장</Button>
          <FileRow label="설정 파일 불러오기" accept="application/json,.json" onFile={p.onImportJson} />
        </div>
      </Group>
    </>
  );

  const frames = Math.round(p.outDuration * s.fps);
  const isAlphaOut = p.out.format === "mov" || p.out.format === "png";
  const estMB =
    dur && isAlphaOut
      ? (frames * estimateFrameKB(s)) / 1024 + (p.out.includeAudio ? (p.outDuration * 48000 * 4) / 1e6 : 0)
      : null;
  const exportTab: ReactNode = (
    <>
      <Group title="출력 형식">
        <Segmented<OutputFormat>
          label="형식"
          value={p.out.format}
          cols={1}
          onChange={(v) => p.setOut({ format: v })}
          options={[
            { value: "mp4", label: "일반 MP4 (배경 포함)" },
            { value: "mov", label: "투명 MOV (한 파일, 알파 포함)" },
            { value: "png", label: "투명 PNG 시퀀스 (ZIP)" },
            { value: "key", label: "합성용 MP4 (단색 배경)" },
          ]}
        />
        {p.out.format === "mov" && (
          <Notice tone="info">
            배경이 투명한 영상 파일 한 개로 저장되고 소리도 함께 들어갑니다. PNG 코덱을 쓴 MOV라서 프리미어 프로, 애프터 이펙트, 파이널 컷 프로 같은 전문 편집 프로그램에서 읽는 형식이에요.
            프로그램이나 버전에 따라 열리지 않을 수 있으니, 그럴 땐 PNG 시퀀스나 합성용 MP4를 쓰세요. 무손실이라 용량이 큰 편이니 필요한 구간만 내보내는 걸 추천해요.
          </Notice>
        )}
        {p.out.format === "mp4" && <Notice tone="info">배경이 들어간 일반 영상입니다. 어디서든 재생됩니다.</Notice>}
        {p.out.format === "key" && (
          <>
            <Segmented<"black" | "green">
              label="배경색"
              value={p.out.keyColor}
              onChange={(v) => p.setOut({ keyColor: v })}
              options={[
                { value: "black", label: "검정" },
                { value: "green", label: "초록" },
              ]}
            />
            <Notice tone="info">
              {p.out.keyColor === "black"
                ? "편집 프로그램에서 이 영상을 다른 영상 위에 올리고 합성 모드를 '스크린' 또는 '더하기'로 바꾸면 검정이 사라집니다. 빛 번짐이 가장 자연스럽게 남아요."
                : "편집 프로그램의 크로마키(초록 화면 제거) 효과로 배경을 지웁니다. 빛 번짐 가장자리에 초록기가 남을 수 있어 빛 번짐을 0%로 두는 걸 추천해요."}
            </Notice>
          </>
        )}
        {p.out.format === "png" && (
          <Notice tone="info">
            배경이 완전히 투명한 PNG를 프레임마다 저장해 ZIP으로 묶습니다. 프리미어, 다빈치 리졸브, 애프터 이펙트, 파이널 컷에서 이미지 시퀀스로 불러오세요.
            캡컷처럼 시퀀스를 지원하지 않는 프로그램은 합성용 MP4를 쓰세요. 길이가 길수록 용량이 커지니 구간 자르기로 필요한 부분만 내보내는 걸 추천해요.
          </Notice>
        )}
      </Group>
      <Group title="소리">
        <Switch
          label="음원 포함"
          hint={
            !p.out.includeAudio
              ? "소리 없이 내보냅니다."
              : p.out.format === "png"
                ? "ZIP 안에 audio.wav가 함께 들어갑니다."
                : "영상에 음원이 함께 들어갑니다."
          }
          checked={p.out.includeAudio}
          onChange={(v) => p.setOut({ includeAudio: v })}
        />
      </Group>
      <Group title="화질">
        <Segmented<720 | 1080>
          label="해상도"
          value={s.resolution}
          onChange={(v) => set({ resolution: v })}
          options={[
            { value: 720, label: "720p 빠름" },
            { value: 1080, label: "1080p 선명" },
          ]}
        />
        <Segmented<30 | 60>
          label="프레임"
          value={s.fps}
          onChange={(v) => set({ fps: v })}
          options={[
            { value: 30, label: "30fps" },
            { value: 60, label: "60fps 오래 걸림" },
          ]}
        />
      </Group>
      <Group title="결과 정보">
        <p className="rounded-lg bg-surface-2 px-4 py-3 text-[15px] tabular-nums text-ink-2">
          {ow}×{oh} · {s.fps}fps · {dur ? `${mmss(p.outDuration)} · ${frames.toLocaleString()}프레임` : "음원을 올리면 길이가 표시됩니다"}
        </p>
        {estMB !== null && (
          <p className="text-sm leading-relaxed text-ink-2">
            예상 용량은 약 {estMB >= 1024 ? `${(estMB / 1024).toFixed(1)}GB` : `${Math.round(estMB)}MB`}입니다. 파형 모양에 따라 달라지는 대략적인 값이에요. 1.5GB를 넘으면 내보내기가 중단됩니다.
          </p>
        )}
        {p.supportMsg && <Notice tone="warn">{p.supportMsg}</Notice>}
        <p className="text-sm leading-relaxed text-ink-2">
          내보내는 동안 이 탭을 켜 두세요. 백그라운드로 보내면 느려질 수 있습니다. 파일은 서버로 전송되지 않고 이 기기에서만 처리됩니다.
        </p>
      </Group>
    </>
  );

  const content: Record<TabId, ReactNode> = { wave, screen, text, audio, preset, export: exportTab };

  return (
    <aside className="mt-3 flex flex-col overflow-hidden rounded-2xl bg-surface ring-1 ring-line lg:sticky lg:top-6 lg:mt-0 lg:max-h-[calc(100dvh-3rem)] lg:self-start">
      <div role="tablist" aria-label="설정 메뉴" className="flex shrink-0 gap-1 overflow-x-auto border-b border-line p-2 [scrollbar-width:none]">
        {TABS.map((t) => {
          const on = t.id === tab;
          return (
            <button
              key={t.id}
              id={`tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`min-h-11 shrink-0 cursor-pointer rounded-lg px-3.5 text-[15px] font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                on ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="space-y-6 overflow-y-auto overscroll-contain p-4 sm:p-5">
        {content[tab]}
      </div>
    </aside>
  );
}
