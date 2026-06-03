import { NextResponse } from "next/server";
// Wire to TenantRepository.findAll() in Sprint 1
export async function GET() {
  return NextResponse.json([]);
}
