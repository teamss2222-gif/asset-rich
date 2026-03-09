import { NextResponse } from "next/server";
import { readSession } from "../../../../lib/session";

export async function GET() {
  const username = await readSession();
  return NextResponse.json({ username });
}
