import { NextResponse } from "next/server";
import { createSupabaseServer } from "../../../lib/supabase-server";

export async function GET() {
  try {
    const supabase = createSupabaseServer();
    // Verify DB connectivity
    const { error } = await supabase.from("profiles").select("id").limit(1);
    
    if (error) throw error;

    return NextResponse.json({ 
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: "connected",
      uptime: process.uptime(),
    }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ 
      status: "unhealthy", 
      timestamp: new Date().toISOString(),
      error: message 
    }, { status: 503 });
  }
}
