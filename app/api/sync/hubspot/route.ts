import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getHubSpotClient } from '@/lib/hubspot'
import { generateEmbedding } from '@/lib/openai'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get('user_id')?.value

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get user's HubSpot tokens
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('hubspot_access_token, hubspot_refresh_token')
      .eq('id', userId)
      .single()

    if (userError || !user?.hubspot_access_token) {
      return NextResponse.json({ error: 'No HubSpot token found. Please reconnect HubSpot.' }, { status: 400 })
    }

    let accessToken = user.hubspot_access_token

    // Try the API call, refresh token if needed
    try {
      // Test if token works
      const testResponse = await fetch(`${process.env.HUBSPOT_API_BASE || 'https://api.hubapi.com'}/crm/v3/objects/contacts?limit=1`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      // If 401, refresh the token
      if (testResponse.status === 401 && user.hubspot_refresh_token) {
        console.log('Token expired, refreshing...')
        const { refreshHubSpotToken } = await import('@/lib/hubspot')
        accessToken = await refreshHubSpotToken(user.hubspot_refresh_token)

        // Update token in database
        await supabase
          .from('users')
          .update({ hubspot_access_token: accessToken })
          .eq('id', userId)

        console.log('Token refreshed successfully')
      }
    } catch (err) {
      console.error('Token test error:', err)
    }


    // Fetch contacts from HubSpot
    console.log('Fetching contacts from HubSpot...')
    console.log('token', accessToken)

    const hubspot = await getHubSpotClient(accessToken) // Use the refreshed token
    const contacts = await hubspot.contacts.list()

    console.log(`Fetched ${contacts.length} contacts, generating embeddings...`)

    // Generate embeddings and store in database
    let inserted = 0
    for (const contact of contacts) {
      try {
        // Create text for embedding (name + email + notes)
        const textForEmbedding = `${contact.firstname} ${contact.lastname} ${contact.email} ${contact.notes}`
        const embedding = await generateEmbedding(textForEmbedding)

        // Check if contact already exists
        const { data: existing } = await supabase
          .from('contacts')
          .select('id')
          .eq('hubspot_id', contact.hubspot_id)
          .eq('user_id', userId)
          .single()

        if (existing) {
          // Update existing contact
          await supabase
            .from('contacts')
            .update({
              email: contact.email,
              name: `${contact.firstname} ${contact.lastname}`.trim(),
              notes: contact.notes,
              embedding: JSON.stringify(embedding)
            })
            .eq('id', existing.id)
        } else {
          // Insert new contact
          const { error: insertError } = await supabase
            .from('contacts')
            .insert({
              user_id: userId,
              hubspot_id: contact.hubspot_id,
              email: contact.email,
              name: `${contact.firstname} ${contact.lastname}`.trim(),
              notes: contact.notes,
              embedding: JSON.stringify(embedding)
            })

          if (!insertError) {
            inserted++
          } else {
            console.error('Insert error:', insertError)
          }
        }

      } catch (err) {
        console.error('Error processing contact:', err)
        continue
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${inserted} new contacts`,
      total: contacts.length
    })

  } catch (error: unknown) {
    console.error('Sync error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Sync failed'
    return NextResponse.json({
      error: errorMessage
    }, { status: 500 })
  }
}