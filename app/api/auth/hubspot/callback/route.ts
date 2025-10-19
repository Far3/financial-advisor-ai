import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  
  const cookieStore = await cookies()
  const userId = cookieStore.get('user_id')?.value
  
  if (!code || !userId) {
    return NextResponse.redirect(new URL('/?error=hubspot_auth_failed', request.url))
  }
  
  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: process.env.HUBSPOT_CLIENT_ID!,
        client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
        redirect_uri: 'http://localhost:3000/api/auth/hubspot/callback',
        code
      })
    })
    
    const tokens = await tokenResponse.json()
    
    if (tokens.error) {
      throw new Error(tokens.error)
    }
    
    // Update user with HubSpot tokens
    const { error } = await supabase
      .from('users')
      .update({
        hubspot_access_token: tokens.access_token,
        hubspot_refresh_token: tokens.refresh_token
      })
      .eq('id', userId)
    
    if (error) throw error
    
    // Redirect back to chat
    return NextResponse.redirect(new URL(`/?user=${userId}&hubspot=connected`, request.url))
    
  } catch (error) {
    console.error('HubSpot OAuth error:', error)
    return NextResponse.redirect(new URL('/?error=hubspot_auth_failed', request.url))
  }
}