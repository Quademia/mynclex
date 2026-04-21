// mynclex/app/logout/route.ts
//
// Route Handler for sign-out.
// POST-only: protects against accidental sign-outs from GET navigations.

import { createClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const url = request.nextUrl.clone();
  url.pathname = '/';
  return NextResponse.redirect(url, { status: 303 });
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  );
}
