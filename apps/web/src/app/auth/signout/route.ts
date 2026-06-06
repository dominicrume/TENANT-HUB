import { NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../lib/supabase-server';

export async function POST(request: Request) {
  const supabase = createSupabaseServer();
  await supabase.auth.signOut();
  return NextResponse.json({ success: true });
}
