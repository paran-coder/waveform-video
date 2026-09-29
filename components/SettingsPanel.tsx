"use client";
// 파형, 색, 배경, 텍스트, 구간, 프리셋 등 모든 설정 입력을 모아 둔 패널
import { useState } from "react";
import { BUILTIN_PRESETS, type Aspect, type BgKind, type ImageLayer, type Settings, type Timeline, type WaveType } from "@/lib/settings";
import { Button, ColorField, FileButton, Section, Select, Slider, TextField, Toggle } from "./ui";

export type AssetKind = "bgImage" | "bgVideo" | "art" | "logo";

interface Props {
  s: Settings;
  set: (p: Partial<Settings>) => void;
  setLayer: (k: "art" | "logo", p: Partial<ImageLayer>) => void;
  onAsset: (kind: AssetKind, f: File) => void;
  audioDuration: number | null;
  tl: Timeline;
  setTl: (p: Partial<Timeline>) => void;
  presets: Record<string, Settings>;
  onSavePreset: (name: string) => void;
  onLoadPreset: (p: Partial<Settings>) => void;
  onDeletePreset: (name: string) => void;
  onExportJson: () => void;
  onImportJson: (f: File) => void;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (v: number) => `${v.toFixed(1)}초`;

function LayerControls(props: {
  title: string;
  layer: ImageLayer;
  onChange: (p: Partial<ImageLayer>) => void;
  onFile: (f: File) => void;
}) {
  const { title, layer: L, onChange } = props;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <FileButton label={`${title} 이미지 선택`} accept="image/*" onFile={props.onFile} />
        <div className="flex-1">
          <Toggle label="표시" checked={L.enabled} onChange={(v) => onChange({ enabled: v })} />
        </div>
      </div>
      <Slider label="가로 위치" value={L.x} min={0} max={1} step={0.01} format={pct} onChange={(v) => onChange({ x: v })} />
      <Slider label="세로 위치" value={L.y} min={0} max={1} step={0.01} format={pct} onChange={(v) => onChange({ y: v })} />
      <Slider label="크기" value={L.size} min={0.03} max={1} step={0.01} format={pct} onChange={(v) => onChange({ size: v })} />
      <Slider label="투명도" value={L.opacity} min={0.1} max={1} step={0.01} format={pct} onChange={(v) => onChange({ opacity: v })} />
      <Slider label="모서리 둥글기 (50%는 원)" value={L.radius} min={0} max={0.5} step={0.01} format={(v) => pct(v)} onChange={(v) => onChange({ radius: v })} />
    </div>
  );
}

export default function SettingsPanel(p: Props) {
  const { s, set, tl, setTl } = p;
  const [presetName, setPresetName] = useState("");
  const dur = p.audioDuration;
  const fadeMax = dur ? Math.max(0.5, Math.min(8, (tl.end - tl.start) / 2)) : 5;

  return (
    <div className="space-y-3">
      <Section title="파형 종류와 모양" open>
        <Select<WaveType>
          label="종류"
          value={s.waveType}
          onChange={(v) => set({ waveType: v })}
          options={[
            { value: "bars", label: "막대" },
            { value: "mirror", label: "미러 막대" },
            { value: "line", label: "라인" },
            { value: "circle", label: "원형" },
            { value: "dots", label: "점" },
          ]}
        />
        <Slider label="막대 개수 (라인 제외)" value={s.barCount} min={8} max={128} step={1} onChange={(v) => set({ barCount: v })} />
        <Slider label="막대 간격" value={s.gap} min={0} max={0.9} step={0.01} format={pct} onChange={(v) => set({ gap: v })} />
        <Slider label="선 굵기 (라인)" value={s.thickness} min={1} max={30} step={1} onChange={(v) => set({ thickness: v })} />
        <Toggle label="둥근 끝" checked={s.rounded} onChange={(v) => set({ rounded: v })} />
        <Slider label="민감도" value={s.sensitivity} min={0.3} max={2.5} step={0.05} onChange={(v) => set({ sensitivity: v })} />
        <Slider label="부드러움 (내려갈 때 잔상)" value={s.smoothing} min={0} max={1} step={0.05} format={pct} onChange={(v) => set({ smoothing: v })} />
        <Slider label="빛 번짐" value={s.glow} min={0} max={1} step={0.05} format={pct} onChange={(v) => set({ glow: v })} />
      </Section>

      <Section title="색">
        <ColorField label="색 1" value={s.color1} onChange={(v) => set({ color1: v })} />
        <Toggle label="그라데이션 사용" checked={s.gradient} onChange={(v) => set({ gradient: v })} />
        {s.gradient && <ColorField label="색 2" value={s.color2} onChange={(v) => set({ color2: v })} />}
      </Section>

      <Section title="파형 위치와 크기">
        <Slider label="가로 위치" value={s.x} min={0} max={1} step={0.01} format={pct} onChange={(v) => set({ x: v })} />
        <Slider label="세로 위치" value={s.y} min={0} max={1} step={0.01} format={pct} onChange={(v) => set({ y: v })} />
        <Slider label="너비" value={s.width} min={0.1} max={1} step={0.01} format={pct} onChange={(v) => set({ width: v })} />
        <Slider label="높이" value={s.height} min={0.05} max={1} step={0.01} format={pct} onChange={(v) => set({ height: v })} />
      </Section>

      <Section title="화면 비율과 화질">
        <Select<Aspect>
          label="비율"
          value={s.aspect}
          onChange={(v) => set({ aspect: v })}
          options={[
            { value: "16:9", label: "16:9 (유튜브)" },
            { value: "9:16", label: "9:16 (숏츠, 릴스)" },
            { value: "1:1", label: "1:1 (정사각형)" },
          ]}
        />
        <Select<720 | 1080>
          label="해상도"
          value={s.resolution}
          onChange={(v) => set({ resolution: v })}
          options={[
            { value: 720, label: "720p (빠름)" },
            { value: 1080, label: "1080p (선명)" },
          ]}
        />
        <Select<30 | 60>
          label="프레임"
          value={s.fps}
          onChange={(v) => set({ fps: v })}
          options={[
            { value: 30, label: "30fps" },
            { value: 60, label: "60fps (오래 걸림)" },
          ]}
        />
      </Section>

      <Section title="배경">
        <Select<BgKind>
          label="종류"
          value={s.bgKind}
          onChange={(v) => set({ bgKind: v })}
          options={[
            { value: "color", label: "색" },
            { value: "image", label: "이미지" },
            { value: "video", label: "영상" },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <FileButton label="배경 이미지 선택" accept="image/*" onFile={(f) => p.onAsset("bgImage", f)} />
          <FileButton label="배경 영상 선택" accept="video/*" onFile={(f) => p.onAsset("bgVideo", f)} />
        </div>
        <ColorField label="배경색 (위)" value={s.bgColor} onChange={(v) => set({ bgColor: v })} />
        <ColorField label="배경색 (아래)" value={s.bgColor2} onChange={(v) => set({ bgColor2: v })} />
        <Slider label="블러" value={s.blur} min={0} max={40} step={1} onChange={(v) => set({ blur: v })} />
        <Slider label="어둡게" value={s.dim} min={0} max={0.9} step={0.01} format={pct} onChange={(v) => set({ dim: v })} />
      </Section>

      <Section title="제목과 아티스트">
        <TextField label="제목" value={s.title} placeholder="곡 제목" onChange={(v) => set({ title: v })} />
        <TextField label="아티스트" value={s.artist} placeholder="아티스트 이름" onChange={(v) => set({ artist: v })} />
        <ColorField label="글자색" value={s.textColor} onChange={(v) => set({ textColor: v })} />
        <Slider label="글자 크기" value={s.titleSize} min={0.02} max={0.15} step={0.005} format={pct} onChange={(v) => set({ titleSize: v })} />
        <Slider label="가로 위치" value={s.textX} min={0} max={1} step={0.01} format={pct} onChange={(v) => set({ textX: v })} />
        <Slider label="세로 위치" value={s.textY} min={0} max={1} step={0.01} format={pct} onChange={(v) => set({ textY: v })} />
      </Section>

      <Section title="앨범 아트">
        <LayerControls title="앨범 아트" layer={s.art} onChange={(x) => p.setLayer("art", x)} onFile={(f) => p.onAsset("art", f)} />
      </Section>

      <Section title="로고">
        <LayerControls title="로고" layer={s.logo} onChange={(x) => p.setLayer("logo", x)} onFile={(f) => p.onAsset("logo", f)} />
      </Section>

      <Section title="진행바">
        <Toggle label="진행바 표시" checked={s.progressOn} onChange={(v) => set({ progressOn: v })} />
        <Select<"top" | "bottom">
          label="위치"
          value={s.progressPos}
          onChange={(v) => set({ progressPos: v })}
          options={[
            { value: "bottom", label: "아래" },
            { value: "top", label: "위" },
          ]}
        />
        <ColorField label="색" value={s.progressColor} onChange={(v) => set({ progressColor: v })} />
        <Slider label="두께" value={s.progressThickness} min={2} max={30} step={1} onChange={(v) => set({ progressThickness: v })} />
      </Section>

      <Section title="저음 반응">
        <Slider label="크기 펄스 (비트마다 커짐)" value={s.pulse} min={0} max={1} step={0.05} format={pct} onChange={(v) => set({ pulse: v })} />
        <Slider label="색 변화 (비트마다 색상 이동)" value={s.colorShift} min={0} max={1} step={0.05} format={pct} onChange={(v) => set({ colorShift: v })} />
      </Section>

      <Section title="구간 자르기와 페이드">
        {dur ? (
          <>
            <Slider label="시작" value={tl.start} min={0} max={Math.max(0, tl.end - 1)} step={0.1} format={sec} onChange={(v) => setTl({ start: v })} />
            <Slider label="끝" value={tl.end} min={Math.min(dur, tl.start + 1)} max={dur} step={0.1} format={sec} onChange={(v) => setTl({ end: v })} />
            <Slider label="페이드 인" value={tl.fadeIn} min={0} max={fadeMax} step={0.1} format={sec} onChange={(v) => setTl({ fadeIn: v })} />
            <Slider label="페이드 아웃" value={tl.fadeOut} min={0} max={fadeMax} step={0.1} format={sec} onChange={(v) => setTl({ fadeOut: v })} />
          </>
        ) : (
          <p className="text-xs text-neutral-400">음원을 올리면 사용할 수 있습니다.</p>
        )}
      </Section>

      <Section title="프리셋">
        <div className="space-y-2">
          {Object.keys(BUILTIN_PRESETS).map((name) => (
            <div key={name} className="flex items-center justify-between text-xs">
              <span>{name}</span>
              <Button onClick={() => p.onLoadPreset(BUILTIN_PRESETS[name])}>적용</Button>
            </div>
          ))}
          {Object.keys(p.presets).map((name) => (
            <div key={name} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex-1 truncate">내 프리셋 · {name}</span>
              <Button onClick={() => p.onLoadPreset(p.presets[name])}>적용</Button>
              <Button kind="danger" onClick={() => p.onDeletePreset(name)}>삭제</Button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="프리셋 이름"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-600"
          />
          <Button
            disabled={!presetName.trim()}
            onClick={() => {
              p.onSavePreset(presetName.trim());
              setPresetName("");
            }}
          >
            저장
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={p.onExportJson}>설정 파일로 저장</Button>
          <FileButton label="설정 파일 불러오기" accept="application/json,.json" onFile={p.onImportJson} />
        </div>
        <p className="text-[11px] text-neutral-500">제목과 아티스트는 프리셋에 덮어쓰지 않고 현재 값을 유지합니다.</p>
      </Section>
    </div>
  );
}
