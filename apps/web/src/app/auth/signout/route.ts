import { NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../lib/supabase-server';

export async function GET(request: Request) {
  const supabase = createSupabaseServer();
  await supabase.auth.signOut();
  
  const url = new URL('/login', request.url);
  const response = NextResponse.redirect(url);
  
  // Nuke cookies just to be absolutely sure
  response.cookies.delete('sb-access-token');
  response.cookies.delete('sb-refresh-token');
  
  return response;
}
