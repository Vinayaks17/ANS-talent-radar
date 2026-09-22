import { cn } from "@/lib/utils";

const MARKET: Record<string, { label: string; cls: string }> = {
  UNKNOWN: { label: "Unknown", cls: "bg-[#F1EFE9] text-[#5B6470]" },
  AVAILABLE_NOW: { label: "Available now", cls: "bg-[#DCEFE3] text-[#14532D]" },
  OPEN_TO_RIGHT_OPPORTUNITY: { label: "Open to right role", cls: "bg-[#DBEAFE] text-[#1E3A8A]" },
  OPEN_LATER: { label: "Open later", cls: "bg-[#FCE8D2] text-[#7C3A00]" },
  PASSIVE: { label: "Passive", cls: "bg-[#E8EAF0] text-[#3B4252]" },
  NOT_LOOKING: { label: "Not looking", cls: "bg-[#EEEEEE] text-[#4B5563]" },
  NOT_INTERESTED: { label: "Not interested", cls: "bg-[#FBE2E2] text-[#7F1D1D]" },
};

const COMM: Record<string, string> = {
  NOT_CONTACTED: "Not contacted",
  SEQUENCE_ACTIVE: "Sequence active",
  WAITING_FOR_REPLY: "Waiting for reply",
  CONVERSATION_ACTIVE: "Conversation active",
  NURTURE_SCHEDULED: "Nurture scheduled",
  HUMAN_REVIEW: "Human review",
  CLOSED: "Closed",
  SUPPRESSED: "Suppressed",
};

export function MarketBadge({ status, className }: { status: string; className?: string }) {
  const m = MARKET[status] ?? MARKET.UNKNOWN;
  return <span className={cn("inline-block px-2.5 py-1 rounded-md text-[11px] font-bold whitespace-nowrap", m.cls, className)}>{m.label}</span>;
}

export function commLabel(status: string) {
  return COMM[status] ?? status;
}

export function marketLabel(status: string) {
  return (MARKET[status] ?? MARKET.UNKNOWN).label;
}
