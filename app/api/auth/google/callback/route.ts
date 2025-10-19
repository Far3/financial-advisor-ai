import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  
  if (!code) {
    const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin
    return NextResponse.redirect(new URL('/?error=no_code', baseUrl))
  }
  
  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        grant_type: 'authorization_code'
      })
    })
    
    const tokens = await tokenResponse.json()
    
    // Get user email
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    })
    const userData = await userResponse.json()
    
    // Store in database
    const { data, error } = await supabase
      .from('users')
      .upsert({
        email: userData.email,
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token
      }, { onConflict: 'email' })
      .select()
      .single()
    
    if (error) throw error
    
    // Get the base URL (works for both localhost and production)
    const baseUrl = process.env.NEXTAUTH_URL || request.nextUrl.origin

    // Redirect to chat with user ID
    const response = NextResponse.redirect(new URL(`/?user=${data.id}`, baseUrl))
    response.cookies.set('user_id', data.id, { httpOnly: true, maxAge: 60 * 60 * 24 * 7 })

    return response
    
  } catch (error) {
    console.error('OAuth error:', error)
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url))
  }
}