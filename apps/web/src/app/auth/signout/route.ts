import { NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../lib/supabase-server';

export async function GET(request: Request) {
  const supabase = createSupabaseServer();
  await supabase.auth.signOut();
  
  const url = new URL('/login', request.url);
  const response = NextResponse.redirect(url);
  
  // Nuke ALL Supabase cookies aggressively
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const cookieName = cookie.split('=')[0].trim();
      if (cookieName.startsWith('sb-')) {
        response.cookies.set(cookieName, '', { maxAge: -1, path: '/' });
      }
    });
  }
  
  return response;
}
