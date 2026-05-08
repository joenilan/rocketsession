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

  const title =
    status === "available" ? `Update available: v${version}. Click to install.` :
    status === "checking" ? "Checking for updates" :
    status === "downloading" ? "Installing update" :
    status === "error" ? (error ?? "Update check failed") :
    status === "up-to-date" ? "Up to date" :
    "Check for updates";

  if (collapsed) {
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

  return (
    <span
      className={twMerge(
        "mt-1 flex items-center gap-1.5 text-[9px] font-mono transition-colors",
        status === "available" && "text-amber-300",
        status === "up-to-date" && "text-green-400",
        status === "error" && "text-red-400",
        (status === "idle" || status === "checking" || status === "downloading") && "text-txt-muted/60",
      )}
      title={title}
    >
      <button
        type="button"
        onClick={() => {
          if (status === "available") void installUpdate();
        }}
        disabled={status !== "available"}
        className={twMerge(
          "leading-none transition-colors",
          status === "available" ? "hover:text-txt-primary cursor-pointer" : "cursor-default",
        )}
      >
        v{pkg.version}
        {status === "available" && version ? ` -> ${version}` : ""}
      </button>
      <button
        type="button"
        title={status === "available" ? "Install update" : "Check for updates"}
        onClick={() => {
          if (status === "available") void installUpdate();
          else void checkForUpdates();
        }}
        disabled={status === "checking" || status === "downloading"}
        className="shrink-0 opacity-70 hover:opacity-100 disabled:cursor-wait transition-opacity"
      >
        {status === "available" ? <Download size={10} /> :
          status === "up-to-date" ? <CheckCircle size={10} /> :
          status === "error" ? <AlertCircle size={10} /> :
          <RefreshCw size={10} className={status === "checking" || status === "downloading" ? "animate-spin" : undefined} />}
      </button>
    </span>
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
