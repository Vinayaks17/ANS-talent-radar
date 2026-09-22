"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Users, Send, Inbox, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { PauseAllButton } from "@/components/pause-all-button";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/candidates", label: "Candidates", icon: Users },
  { href: "/campaigns", label: "Campaigns", icon: Send },
  { href: "/review", label: "Review queue", icon: Inbox },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppSidebar(props: {
  orgName: string;
  logoText: string;
  displayName: string;
  role: string;
  reviewCount: number;
  outreachPaused: boolean;
  canPause: boolean;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="w-[232px] shrink-0 bg-sidebar text-sidebar-foreground flex flex-col px-3.5 pt-5 pb-4 gap-1.5 min-h-screen">
      <div className="flex items-center gap-2.5 px-2.5 pb-5">
        <div className="w-[34px] h-[34px] rounded-[9px] bg-[var(--brand-coral)] text-[var(--brand-navy)] font-heading font-bold text-[15px] flex items-center justify-center">
          {props.logoText}
        </div>
        <div className="leading-tight">
          <div className="text-sm font-bold">Talent Radar</div>
          <div className="text-[11px] text-[#B7C3DA]">{props.orgName}</div>
        </div>
      </div>

      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] transition-colors",
              active ? "bg-white/15 text-white font-semibold" : "text-[#D6DEEC] font-medium hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon className="w-4 h-4" />
            <span className="flex-1">{label}</span>
            {href === "/review" && props.reviewCount > 0 && (
              <span className="bg-[var(--brand-coral)] text-[var(--brand-navy)] text-[11px] font-bold px-[7px] py-0.5 rounded-full">
                {props.reviewCount}
              </span>
            )}
          </Link>
        );
      })}

      <div className="flex-1" />

      {props.canPause && <PauseAllButton paused={props.outreachPaused} />}

      <div className="flex items-center gap-2.5 px-2 pt-3.5">
        <div className="w-[30px] h-[30px] rounded-full bg-[#2A4A85] flex items-center justify-center text-xs font-bold">
          {props.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="leading-tight flex-1 min-w-0">
          <div className="text-xs font-semibold truncate">{props.displayName}</div>
          <div className="text-[11px] text-[#B7C3DA] capitalize">{props.role}</div>
        </div>
        <form action={props.signOut}>
          <button type="submit" aria-label="Sign out" className="p-1.5 rounded hover:bg-white/10 text-[#B7C3DA]">
            <LogOut className="w-4 h-4" />
          </button>
        </form>
      </div>
    </nav>
  );
}
