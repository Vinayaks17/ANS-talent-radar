import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { Webhook } from "svix";
import { env } from "@/lib/env";
import { adminClient } from "@/lib/supabase/admin";
import { processInboundEvents } from "@/lib/workers/inbound";

/**
 * Resend → us. Verify signature, store the raw event, return 200 fast, then
 * process in the background. Idempotent on the svix-id.
 */
export async function POST(request: NextRequest) {
  const secret = env().RESEND_WEBHOOK_SECRET;
  const raw = await request.text();
  const svixId = request.headers.get("svix-id");
  const svixTs = request.headers.get("svix-timestamp");
  const svixSig = request.headers.get("svix-signature");

  if (!secret) return NextResponse.json({ error: "webhook secret not configured" }, { status: 503 });
  if (!svixId || !svixTs || !svixSig) return NextResponse.json({ error: "missing signature headers" }, { status: 400 });

  let event: { type: string; data?: Record<string, unknown> };
  try {
    event = new Webhook(secret).verify(raw, { "svix-id": svixId, "svix-timestamp": svixTs, "svix-signature": svixSig }) as unknown as typeof event;
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const db = adminClient();
  const { error } = await db.from("inbound_events").insert({ provider: "resend", provider_event_id: svixId, event_type: event.type, payload: event as never });
  if (error && !/duplicate|unique/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 500 });

  after(async () => {
    try { await processInboundEvents(db, 20); } catch (e) { console.error("inbound processing failed", e); }
  });
  return NextResponse.json({ ok: true });
}
