import { useState, useEffect } from "react";
import { Info, Globe, Coffee, ExternalLink, Sparkles, RefreshCw, CheckCircle, Download, AlertCircle } from "lucide-react";
import { Rocket } from "lucide-react";
import { ViewShell } from "../components/ViewShell";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useUpdateStatus } from "../context/UpdateContext";

const LINKS = [
  { label: "livestreaming.tools", href: "https://livestreaming.tools", icon: Globe },
  { label: "Buy Me a Coffee",     href: "https://buymeacoffee.com/crntly", icon: Coffee },
];

export function AboutView() {
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const {
    status: updateStatus,
    version: updateVersion,
    error: updateError,
    checkForUpdates,
    installUpdate,
  } = useUpdateStatus();

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  async function openExternalUrl(url: string) {
    try {
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <ViewShell
      title="About"
      subtitle="Project info, credits, and useful links."
      icon={Info}
    >
      {/* Hero */}
      <div className="bg-surface-card/60 border border-txt-primary/10 rounded-xl p-5 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center shadow-lg shadow-accent/30 mb-3">
            <Rocket size={22} className="text-white" />
          </div>
          <h2 className="text-sm font-bold font-mono tracking-widest text-txt-primary uppercase leading-none">
            Rocket Session Stats
          </h2>
          <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-accent/70 mt-1 mb-3">
            {appVersion ? `v${appVersion}` : "…"}
          </span>
          <p className="text-xs text-txt-secondary max-w-xs leading-relaxed">
            Track wins, losses, streaks, and match stats from Rocket League&apos;s official Stats API.
            No BakkesMod required — just enable the API and play.
          </p>
          <div className="mt-4 text-[10px] uppercase tracking-[0.25em] text-txt-muted">
            Made with{" "}
            <span className="text-red-400">♥</span>
            {" "}by{" "}
            <span className="text-txt-primary font-semibold">DREADEDZOMBIE</span>
            {" "}&{" "}
            <span className="text-txt-primary font-semibold">TOMLIT</span>
          </div>
        </div>

        <div className="mt-5 rounded-xl border border-txt-primary/10 bg-txt-primary/5 p-3.5 text-left">
          <div className="flex items-center gap-1.5 text-[9px] font-mono font-bold uppercase tracking-widest text-accent mb-2">
            <Sparkles size={11} />
            Quick Start
          </div>
          <ol className="space-y-1 text-xs text-txt-secondary">
            <li>1. Enable the Stats API on the Session page.</li>
            <li>2. Close and restart Rocket League.</li>
            <li>3. Add the overlay URL as a Browser Source in OBS — see the OBS page for details.</li>
          </ol>
        </div>
      </div>

      {/* Updates */}
      <div className="bg-surface-card/60 border border-txt-primary/10 rounded-xl p-4 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
        <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted mb-3">Updates</p>

        {updateStatus === "idle" && (
          <button
            onClick={checkForUpdates}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-txt-primary/10 bg-txt-primary/5 text-xs text-txt-secondary hover:text-txt-primary hover:border-txt-primary/30 transition-all w-full"
          >
            <RefreshCw size={13} />
            Check for Updates
          </button>
        )}

        {updateStatus === "checking" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-txt-primary/10 bg-txt-primary/5 text-xs text-txt-muted">
            <RefreshCw size={13} className="animate-spin" />
            Checking for updates…
          </div>
        )}

        {updateStatus === "up-to-date" && (
          <div className="flex items-center justify-between px-3 py-2 rounded-lg border border-green-500/20 bg-green-500/5 text-xs">
            <span className="flex items-center gap-2 text-green-400">
              <CheckCircle size={13} />
              You&apos;re up to date
            </span>
            <button onClick={checkForUpdates} className="text-txt-muted hover:text-txt-secondary transition-colors">
              <RefreshCw size={11} />
            </button>
          </div>
        )}

        {updateStatus === "available" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-accent/30 bg-accent/5 text-xs text-accent">
              <Download size={13} />
              Update available: v{updateVersion}
            </div>
            <button
              onClick={installUpdate}
              className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg border border-accent/40 bg-accent/10 text-xs text-accent hover:bg-accent/20 transition-all font-medium"
            >
              <Download size={13} />
              Download &amp; Install
            </button>
          </div>
        )}

        {updateStatus === "downloading" && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-accent/30 bg-accent/5 text-xs text-accent">
            <Download size={13} className="animate-bounce" />
            Downloading update… app will restart
          </div>
        )}

        {updateStatus === "error" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/20 bg-red-500/5 text-xs text-red-400">
              <AlertCircle size={13} />
              {updateError ?? "Update check failed"}
            </div>
            <button onClick={checkForUpdates} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-txt-primary/10 bg-txt-primary/5 text-xs text-txt-secondary hover:text-txt-primary transition-all w-full">
              <RefreshCw size={13} />
              Try again
            </button>
          </div>
        )}
      </div>

      {/* Links */}
      <div className="bg-surface-card/60 border border-txt-primary/10 rounded-xl p-4 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
        <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted mb-3">Connect</p>
        <div className="space-y-1.5">
          {LINKS.map(({ label, href, icon: Icon }) => (
            <button
              key={href}
              type="button"
              onClick={() => void openExternalUrl(href)}
              className="flex items-center justify-between px-3 py-2 rounded-lg border border-txt-primary/10 bg-txt-primary/5 text-xs text-txt-secondary hover:text-txt-primary hover:border-txt-primary/30 transition-all"
            >
              <span className="flex items-center gap-2">
                <Icon size={13} />
                {label}
              </span>
              <ExternalLink size={11} className="text-txt-muted" />
            </button>
          ))}
        </div>
      </div>
    </ViewShell>
  );
}
