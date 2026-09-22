import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="h-16 shrink-0 px-8 flex items-center gap-3 border-b bg-white">
      <h1 className="text-lg font-bold">{title}</h1>
      {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      <div className="flex-1" />
      {children}
    </header>
  );
}
