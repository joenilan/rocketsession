import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";

export type View = "session" | "history" | "overlay" | "logs" | "settings" | "about";

interface LayoutProps {
  children: ReactNode;
  currentView: View;
  setCurrentView: (v: View) => void;
}

export function Layout({ children, currentView, setCurrentView }: LayoutProps) {
  return (
    <div className="flex h-screen w-full bg-surface-base text-txt-primary overflow-hidden">
      <Sidebar currentView={currentView} setCurrentView={setCurrentView} />
      <main className="flex-1 flex flex-col min-w-0 bg-surface-card rounded-xl shadow-2xl relative overflow-hidden my-1.5 mr-1.5 border border-txt-primary/10">
        {children}
      </main>
    </div>
  );
}
