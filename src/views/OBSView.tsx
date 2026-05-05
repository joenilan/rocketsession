import { useState, useEffect, useRef } from "react";
import { Layers, Copy, Check, FolderOpen } from "lucide-react";
import { ViewShell } from "../components/ViewShell";
import { getJson, postJson } from "../lib/api";
import { buildOverlayUrl, useOverlayPoster, clampOverlay, OVERLAY_DEFAULTS } from "../hooks/useOverlaySettings";
import type { SessionSnapshot, OverlaySettings } from "../types";

function Slider({
  label, value, min, max, unit = "", onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted">{label}</label>
        <span className="text-[9px] font-mono text-txt-secondary tabular-nums">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.currentTarget.value))}
        className="w-full h-1.5 rounded-full cursor-pointer appearance-none"
        style={{
          background: `linear-gradient(to right, rgb(var(--color-accent-primary)) 0%, rgb(var(--color-accent-primary)) ${pct}%, rgba(255,255,255,0.1) ${pct}%, rgba(255,255,255,0.1) 100%)`,
        }}
      />
    </div>
  );
}

export function OBSView({ snapshot }: { snapshot: SessionSnapshot }) {
  const [copied, setCopied] = useState(false);
  const [ip, setIp] = useState("127.0.0.1");

  // Local mirror of overlay settings for immediate slider feedback
  const [local, setLocal] = useState<OverlaySettings>(() => snapshot.overlaySettings ?? OVERLAY_DEFAULTS);
  const postSettings = useOverlayPoster();

  // Keep local in sync when SSE pushes an update from another source
  const lastSnapshotRef = useRef<OverlaySettings | null>(null);
  useEffect(() => {
    const s = snapshot.overlaySettings;
    if (!s) return;
    const prev = lastSnapshotRef.current;
    if (!prev || prev.x !== s.x || prev.y !== s.y || prev.scale !== s.scale || prev.opacity !== s.opacity) {
      lastSnapshotRef.current = s;
      setLocal(s);
    }
  }, [snapshot.overlaySettings]);

  useEffect(() => {
    getJson<{ ips: string[] }>("/api/ips")
      .then((res) => { if (res.ips?.[0]) setIp(res.ips[0]); })
      .catch(() => undefined);
  }, [snapshot.allowDualPC]);

  const baseUrl = `http://${ip}:49410`;
  const overlayUrl = buildOverlayUrl(baseUrl);

  function update(patch: Partial<OverlaySettings>) {
    const next: OverlaySettings = {
      x:       clampOverlay(patch.x       ?? local.x,       0,   100),
      y:       clampOverlay(patch.y       ?? local.y,       0,   100),
      scale:   clampOverlay(patch.scale   ?? local.scale,   50,  200),
      opacity: clampOverlay(patch.opacity ?? local.opacity,  0,  100),
    };
    setLocal(next);
    postSettings(next);
  }

  function reset() {
    update(OVERLAY_DEFAULTS);
  }

  // Mini viewport preview
  const previewW = 240;
  const previewH = Math.round(previewW * (9 / 16));

  function copyUrl() {
    void navigator.clipboard.writeText(overlayUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <ViewShell
      title="Overlay"
      subtitle="Configure and add the stats widget to OBS Studio."
      icon={Layers}
    >
      {/* Position, Scale & Opacity */}
      <div className="bg-surface-card/60 border border-txt-primary/10 rounded-xl p-4 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted">Position, Scale & Opacity</p>
          <button
            onClick={reset}
            className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted hover:text-txt-primary transition-colors px-2 py-1 rounded-lg border border-txt-primary/10 hover:border-txt-primary/30"
          >
            Reset to Center
          </button>
        </div>

        <div className="space-y-3">
          <Slider label="Horizontal" value={local.x}       min={0}  max={100} unit="%" onChange={(v) => update({ x: v })} />
          <Slider label="Vertical"   value={local.y}       min={0}  max={100} unit="%" onChange={(v) => update({ y: v })} />
          <Slider label="Scale"      value={local.scale}   min={50} max={200} unit="%" onChange={(v) => update({ scale: v })} />
          <Slider label="Opacity"    value={local.opacity} min={0}  max={100} unit="%" onChange={(v) => update({ opacity: v })} />
        </div>

        {/* Mini viewport preview */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-[9px] font-mono text-txt-muted self-start">Preview</p>
          <div
            className="relative rounded-lg border border-txt-primary/15 bg-surface-base/60 overflow-hidden"
            style={{ width: previewW, height: previewH }}
          >
            <div className="absolute inset-0 opacity-10" style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
              backgroundSize: "25% 25%",
            }} />
            <div className="absolute top-1/2 inset-x-0 h-px bg-txt-primary/10" />
            <div className="absolute left-1/2 inset-y-0 w-px bg-txt-primary/10" />
            {(() => {
              const ww = Math.round(60 * (local.scale / 100));
              const wh = Math.round(26 * (local.scale / 100));
              const rawX = (local.x / 100) * previewW;
              const rawY = (local.y / 100) * previewH;
              const px = Math.min(previewW - ww / 2, Math.max(ww / 2, rawX));
              const py = Math.min(previewH - wh / 2, Math.max(wh / 2, rawY));
              return (
                <div
                  className="absolute rounded-sm shadow-lg"
                  style={{
                    width: ww,
                    height: wh,
                    left: px,
                    top: py,
                    transform: "translate(-50%, -50%)",
                    background: "rgb(var(--color-accent-primary))",
                    opacity: local.opacity / 100,
                  }}
                />
              );
            })()}
            <span className="absolute top-1 left-1.5 text-[7px] font-mono text-txt-muted/40">TL</span>
            <span className="absolute top-1 right-1.5 text-[7px] font-mono text-txt-muted/40">TR</span>
            <span className="absolute bottom-1 left-1.5 text-[7px] font-mono text-txt-muted/40">BL</span>
            <span className="absolute bottom-1 right-1.5 text-[7px] font-mono text-txt-muted/40">BR</span>
          </div>
          <p className="text-[8px] font-mono text-txt-muted/50 text-center">
            Widget preview updates live. OBS moves in real-time — no re-copy needed.
          </p>
        </div>
      </div>

      {/* Overlay URL */}
      <div className="bg-surface-card/60 border border-txt-primary/10 rounded-xl p-4 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted">Overlay URL</p>
            <p className="text-[8px] font-mono text-txt-muted/60">Paste once — updates live via SSE</p>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-surface-base/60 border border-txt-primary/10 rounded-lg px-3 py-2 text-xs font-mono text-accent truncate">
              {overlayUrl}
            </code>
            <button
              onClick={copyUrl}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-txt-primary/15 bg-txt-primary/5 text-txt-secondary text-xs font-semibold hover:text-txt-primary hover:border-txt-primary/30 transition-all shrink-0"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <div>
          <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted mb-2">OBS Setup</p>
          <ol className="space-y-2 text-xs text-txt-secondary">
            <li className="flex gap-2.5">
              <span className="w-4 h-4 rounded-full border border-txt-primary/20 text-[9px] font-mono font-bold text-txt-muted flex items-center justify-center shrink-0 mt-0.5">1</span>
              <span>Add a <strong className="text-txt-primary">Browser Source</strong> to your scene</span>
            </li>
            <li className="flex gap-2.5">
              <span className="w-4 h-4 rounded-full border border-txt-primary/20 text-[9px] font-mono font-bold text-txt-muted flex items-center justify-center shrink-0 mt-0.5">2</span>
              <span>Paste the URL above, set size to <code className="text-accent px-1 py-0.5 bg-surface-base/60 rounded border border-txt-primary/10">1920×1080</code></span>
            </li>
            <li className="flex gap-2.5">
              <span className="w-4 h-4 rounded-full border border-txt-primary/20 text-[9px] font-mono font-bold text-txt-muted flex items-center justify-center shrink-0 mt-0.5">3</span>
              <span>Adjust position, scale & opacity — OBS updates <strong className="text-txt-primary">in real-time</strong>, no re-paste needed</span>
            </li>
          </ol>
        </div>
      </div>

      {/* Text files */}
      <div className="bg-surface-card/60 border border-txt-primary/10 rounded-xl p-4 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted">Text Files</p>
          <button
            onClick={() => void postJson("/api/open-obs-text")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-txt-primary/15 bg-txt-primary/5 text-txt-secondary text-xs font-semibold hover:text-txt-primary hover:border-txt-primary/30 transition-all shrink-0"
          >
            <FolderOpen size={12} />
            Open Folder
          </button>
        </div>
        <p className="text-xs text-txt-secondary leading-relaxed">
          Prefer building your own layout? Load wins, losses, streak etc. as <strong className="text-txt-primary">Text (GDI+)</strong> sources from the text files in this folder.
        </p>
      </div>
    </ViewShell>
  );
}
