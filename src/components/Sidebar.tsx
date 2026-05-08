import { AlertCircle, CheckCircle, ChevronLeft, ChevronRight, BarChart2, Download, Monitor, Rocket, RefreshCw, Settings, Info, History, Terminal } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { useState } from "react";
import { View } from "./Layout";
import pkg from "../../package.json";
import { useUpdateStatus } from "../context/UpdateContext";

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick: () => void;
  collapsed: boolean;
}

function NavItem({ icon: Icon, label, active, onClick, collapsed }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={twMerge(
        "flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all duration-200 group text-xs w-full",
        active
          ? "bg-accent text-white font-semibold shadow-lg shadow-accent/20"
          : "text-txt-secondary hover:bg-surface-hover hover:text-txt-primary",
        collapsed && "justify-center px-2",
      )}
    >
      <Icon
        size={15}
        className={twMerge(
          "shrink-0 transition-colors",
          active ? "text-white" : "text-txt-muted group-hover:text-accent",
        )}
      />
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

function SidebarUpdateStatus({ collapsed }: { collapsed: boolean }) {
  const { status, version, error, checkForUpdates, installUpdate } = useUpdateStatus();

  if (collapsed) {
    const title =
      status === "available" ? `Update available: v${version}` :
      status === "checking" ? "Checking for updates" :
      status === "downloading" ? "Installing update" :
      status === "error" ? (error ?? "Update check failed") :
      status === "up-to-date" ? "Up to date" :
      "Check for updates";

    return (
      <button
        type="button"
        title={title}
        onClick={() => {
          if (status === "available") void installUpdate();
          else if (status !== "checking" && status !== "downloading") void checkForUpdates();
        }}
        disabled={status === "checking" || status === "downloading"}
        className={twMerge(
          "mt-2 h-7 w-7 rounded-lg border flex items-center justify-center transition-all",
          status === "available" && "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20",
          status === "up-to-date" && "border-green-500/20 bg-green-500/5 text-green-400",
          status === "error" && "border-red-500/20 bg-red-500/5 text-red-400",
          (status === "idle" || status === "checking" || status === "downloading") && "border-txt-primary/10 bg-txt-primary/5 text-txt-muted hover:text-txt-primary",
          (status === "checking" || status === "downloading") && "cursor-wait",
        )}
      >
        {status === "available" ? <Download size={12} /> :
          status === "up-to-date" ? <CheckCircle size={12} /> :
          status === "error" ? <AlertCircle size={12} /> :
          <RefreshCw size={12} className={status === "checking" || status === "downloading" ? "animate-spin" : undefined} />}
      </button>
    );
  }

  const label =
    status === "available" ? `v${version} available` :
    status === "checking" ? "Checking updates" :
    status === "downloading" ? "Installing update" :
    status === "error" ? "Update failed" :
    status === "up-to-date" ? "Up to date" :
    "Check updates";

  const icon =
    status === "available" ? <Download size={11} /> :
    status === "up-to-date" ? <CheckCircle size={11} /> :
    status === "error" ? <AlertCircle size={11} /> :
    <RefreshCw size={11} className={status === "checking" || status === "downloading" ? "animate-spin" : undefined} />;

  return (
    <div
      className={twMerge(
        "mt-2 rounded-lg border px-2 py-1.5 animate-in fade-in duration-200",
        status === "available" && "border-accent/35 bg-accent/10 text-accent",
        status === "up-to-date" && "border-green-500/20 bg-green-500/5 text-green-400",
        status === "error" && "border-red-500/20 bg-red-500/5 text-red-400",
        (status === "idle" || status === "checking" || status === "downloading") && "border-txt-primary/10 bg-txt-primary/5 text-txt-muted",
      )}
      title={status === "error" ? error ?? undefined : undefined}
    >
      <div className="flex items-center justify-between gap-1.5">
        <button
          type="button"
          onClick={() => {
            if (status === "available") void installUpdate();
          }}
          disabled={status !== "available"}
          className={twMerge(
            "min-w-0 flex flex-1 items-center gap-1.5 text-left text-[9px] font-mono font-semibold uppercase tracking-wide transition-colors",
            status === "available" ? "hover:text-txt-primary" : "cursor-default",
          )}
        >
          <span className="shrink-0">{icon}</span>
          <span className="truncate">{label}</span>
        </button>
        <button
          type="button"
          title="Check for updates"
          onClick={() => void checkForUpdates()}
          disabled={status === "checking" || status === "downloading"}
          className="shrink-0 text-current opacity-60 hover:opacity-100 disabled:cursor-wait transition-opacity"
        >
          <RefreshCw size={10} className={status === "checking" ? "animate-spin" : undefined} />
        </button>
      </div>
    </div>
  );
}

interface SidebarProps {
  currentView: View;
  setCurrentView: (v: View) => void;
}

export function Sidebar({ currentView, setCurrentView }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={twMerge(
        "h-full flex flex-col p-3 bg-surface-base shrink-0 transition-all duration-300 relative",
        collapsed ? "w-14" : "w-44",
      )}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-2.5 top-5 w-5 h-5 bg-surface-card border border-surface-hover rounded-full text-txt-muted hover:text-txt-primary flex items-center justify-center shadow-lg hover:scale-105 transition-all z-10"
      >
        {collapsed ? <ChevronRight size={11} /> : <ChevronLeft size={11} />}
      </button>

      {/* Logo */}
      <div
        className={twMerge(
          "flex items-center gap-2 px-1.5 mb-4 mt-1 transition-all",
          collapsed && "justify-center px-0",
        )}
      >
        <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center shadow-lg shadow-accent/30 shrink-0">
          <Rocket size={13} className="text-white" />
        </div>
        {!collapsed && (
          <div className="flex flex-col animate-in fade-in duration-200">
            <h1 className="text-[11px] font-bold tracking-widest font-mono leading-none text-txt-primary uppercase">
              Rocket Session
            </h1>
            <span className="text-[9px] text-accent font-mono font-medium opacity-80 tracking-wider mt-0.5">
              Stats
            </span>
            <span className="text-[9px] font-mono text-txt-muted opacity-40 mt-1">
              v{pkg.version}
            </span>
            <SidebarUpdateStatus collapsed={false} />
          </div>
        )}
        {collapsed && <SidebarUpdateStatus collapsed />}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        <NavItem icon={BarChart2} label="Session"  active={currentView === "session"}  onClick={() => setCurrentView("session")}  collapsed={collapsed} />
        <NavItem icon={History}   label="History"  active={currentView === "history"}  onClick={() => setCurrentView("history")}  collapsed={collapsed} />
        <NavItem icon={Monitor}   label="Overlay"  active={currentView === "overlay"}  onClick={() => setCurrentView("overlay")}  collapsed={collapsed} />
        <NavItem icon={Terminal}  label="Logs"     active={currentView === "logs"}     onClick={() => setCurrentView("logs")}     collapsed={collapsed} />
        <NavItem icon={Info}      label="About"    active={currentView === "about"}    onClick={() => setCurrentView("about")}    collapsed={collapsed} />
      </nav>

      {/* Settings */}
      <div className="mt-auto pt-2 border-t border-txt-primary/5">
        <NavItem icon={Settings}  label="Settings" active={currentView === "settings"} onClick={() => setCurrentView("settings")} collapsed={collapsed} />
      </div>
    </div>
  );
}
