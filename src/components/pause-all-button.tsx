"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setOutreachPaused } from "@/app/(app)/settings/actions";

export function PauseAllButton({ paused }: { paused: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await setOutreachPaused(!paused);
          if (res.error) toast.error(res.error);
          else toast.success(paused ? "Outreach resumed" : "All outreach paused");
        })
      }
      className={
        paused
          ? "w-full py-3 rounded-lg bg-[var(--brand-coral)] text-[var(--brand-navy)] text-[13px] font-bold"
          : "w-full py-3 rounded-lg border-2 border-[var(--brand-coral)] text-white text-[13px] font-bold hover:bg-white/5"
      }
    >
      {pending ? "…" : paused ? "Resume outreach" : "Pause all outreach"}
    </button>
  );
}
