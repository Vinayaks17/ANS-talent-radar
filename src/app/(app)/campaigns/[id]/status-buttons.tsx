"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setCampaignStatus } from "../actions";

export function StatusButtons({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const set = (st: "ACTIVE" | "PAUSED" | "ARCHIVED") =>
    start(async () => {
      const r = await setCampaignStatus(id, st);
      if (r.error) toast.error(r.error); else toast.success(`Campaign ${st.toLowerCase()}`);
    });
  return (
    <div className="flex gap-2">
      {status !== "ACTIVE" && <Button onClick={() => set("ACTIVE")} disabled={pending}>Activate</Button>}
      {status === "ACTIVE" && <Button variant="outline" onClick={() => set("PAUSED")} disabled={pending} className="text-[#7C3A00]">Pause campaign</Button>}
      {status !== "ARCHIVED" && <Button variant="ghost" onClick={() => set("ARCHIVED")} disabled={pending}>Archive</Button>}
    </div>
  );
}
