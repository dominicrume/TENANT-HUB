import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({ status: "ok", service: "tenant-hub", ts: new Date().toISOString() });
}
