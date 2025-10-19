import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  const clientId = process.env.HUBSPOT_CLIENT_ID
  const redirectUri = 'http://localhost:3000/api/auth/hubspot/callback'
  
  // Get current user ID from cookie
  const cookieStore = cookies()
  const userId = cookieStore.get('user_id')?.value
  
  if (!userId) {
    return NextResponse.redirect('http://localhost:3000?error=not_logged_in')
  }
  
  const scopes = [
    'crm.objects.contacts.read',
    'crm.objects.contacts.write',
    'crm.schemas.contacts.read',
    'timeline'
  ]
  
  const authUrl = `https://app.hubspot.com/oauth/authorize?${new URLSearchParams({
    client_id: clientId!,
    redirect_uri: redirectUri,
    scope: scopes.join(' ')
  })}`
  
  return NextResponse.redirect(authUrl)
}