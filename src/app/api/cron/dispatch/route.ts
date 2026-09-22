import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/admin";
import { runDispatcher } from "@/lib/workers/dispatcher";
import { processInboundEvents } from "@/lib/workers/inbound";

export const maxDuration = 300;

/**
 * Dispatch worker. Called every 5 minutes by pg_cron + pg_net (0003_dispatch_schedule.sql)
 * and daily by Vercel Cron as a fallback; both send `Authorization: Bearer $CRON_SECRET`.
 * Processes due scheduled actions, then any inbound events the webhook handed off.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env().CRON_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = adminClient();
  const started = Date.now();
  const inbound = await processInboundEvents(db, 100);
  const dispatch = await runDispatcher(db, { limit: 100 });
  return NextResponse.json({ ok: true, ms: Date.now() - started, inbound, dispatch });
}
