import { NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../lib/supabase-server';

// Handle POST for clean fetch calls from client components
export async function POST(request: Request) {
  const supabase = createSupabaseServer();
  try {
    await supabase.auth.signOut();
  } catch (e) {
    // Ignore error, we still want to nuke cookies
  }
  
  const response = NextResponse.json({ success: true });
  
  // Nuke ALL Supabase cookies aggressively
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      if (parts && parts.length > 0 && parts[0]) {
        const cookieName = parts[0].trim();
        if (cookieName.startsWith('sb-')) {
          response.cookies.delete(cookieName);
        }
      }
    });
  }
  
  return response;
}

// Keep GET for direct navigation / anchor links
export async function GET(request: Request) {
  const supabase = createSupabaseServer();
  try {
    await supabase.auth.signOut();
  } catch (e) {
    // Ignore error
  }
  
  const url = new URL('/login', request.url);
  const response = NextResponse.redirect(url);
  
  // Nuke ALL Supabase cookies aggressively
  const cookieHeader = request.headers.get('cookie');
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      if (parts && parts.length > 0 && parts[0]) {
        const cookieName = parts[0].trim();
        if (cookieName.startsWith('sb-')) {
          response.cookies.delete(cookieName);
        }
      }
    });
  }
  
  return response;
}
