import { Info, Globe, Coffee, ExternalLink, Sparkles } from "lucide-react";
import { Rocket } from "lucide-react";
import { ViewShell } from "../components/ViewShell";

const VERSION = "v0.1.0";

const LINKS = [
  { label: "livestreaming.tools", href: "https://livestreaming.tools", icon: Globe },
  { label: "Buy Me a Coffee",     href: "https://buymeacoffee.com/crntly", icon: Coffee },
];

export function AboutView() {
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
            {VERSION}
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

      {/* Links */}
      <div className="bg-surface-card/60 border border-txt-primary/10 rounded-xl p-4 backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-300">
        <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-txt-muted mb-3">Connect</p>
        <div className="space-y-1.5">
          {LINKS.map(({ label, href, icon: Icon }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-3 py-2 rounded-lg border border-txt-primary/10 bg-txt-primary/5 text-xs text-txt-secondary hover:text-txt-primary hover:border-txt-primary/30 transition-all"
            >
              <span className="flex items-center gap-2">
                <Icon size={13} />
                {label}
              </span>
              <ExternalLink size={11} className="text-txt-muted" />
            </a>
          ))}
        </div>
      </div>
    </ViewShell>
  );
}
