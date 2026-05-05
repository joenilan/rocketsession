import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface ViewShellProps {
  title: string;
  subtitle: string;
  icon?: LucideIcon;
  headerAction?: ReactNode;
  children: ReactNode;
}

export function ViewShell({ title, subtitle, icon: Icon, headerAction, children }: ViewShellProps) {
  return (
    <div className="h-full flex flex-col p-4 overflow-hidden">
      <header className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            {Icon && <Icon size={16} className="text-accent shrink-0" />}
            <h2 className="text-base font-bold font-mono tracking-wider text-txt-primary">{title}</h2>
          </div>
          <p className="text-[11px] text-txt-muted">{subtitle}</p>
        </div>
        {headerAction && <div className="flex gap-2">{headerAction}</div>}
      </header>
      <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
        {children}
      </div>
    </div>
  );
}
