import { NextResponse, type NextRequest } from "next/server";
import { suppressByToken } from "@/app/u/[token]/actions";

/**
 * Target of the List-Unsubscribe header.
 * POST = RFC 8058 one-click (mail clients). GET = a human clicked; show the confirm page.
 */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/unsubscribe/[token]">) {
  const { token } = await ctx.params;
  await suppressByToken(token.replace(/[^a-z0-9]/gi, ""));
  return new NextResponse(null, { status: 200 });
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/unsubscribe/[token]">) {
  const { token } = await ctx.params;
  return NextResponse.redirect(new URL(`/u/${token.replace(/[^a-z0-9]/gi, "")}`, req.url));
}
