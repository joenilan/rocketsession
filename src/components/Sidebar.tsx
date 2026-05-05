import { ChevronLeft, ChevronRight, BarChart2, Monitor, Rocket, Settings, Info, History, Terminal } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { useState } from "react";
import { View } from "./Layout";
import pkg from "../../package.json";

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
          </div>
        )}
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
