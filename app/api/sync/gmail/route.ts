import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { fetchEmails } from '@/lib/gmail'
import { generateEmbedding } from '@/lib/openai'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get('user_id')?.value
    
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    // Get user's Google token
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('google_access_token')
      .eq('id', userId)
      .single()
    
    if (userError || !user?.google_access_token) {
      return NextResponse.json({ error: 'No Google token found' }, { status: 400 })
    }
    
    // Fetch emails from Gmail
    console.log('Fetching emails...')
    const emails = await fetchEmails(user.google_access_token, 20)
    
    console.log(`Fetched ${emails.length} emails, generating embeddings...`)
    
    // Generate embeddings and store in database
    let inserted = 0
    for (const email of emails) {
      try {
        // Create text for embedding (subject + body)
        const textForEmbedding = `${email.subject}\n\n${email.body}`
        const embedding = await generateEmbedding(textForEmbedding)
        
        // Check if email already exists
        const { data: existing } = await supabase
          .from('emails')
          .select('id')
          .eq('gmail_id', email.gmail_id)
          .eq('user_id', userId)
          .single()
        
        if (!existing) {
          // Insert into database
          const { error: insertError } = await supabase
            .from('emails')
            .insert({
              user_id: userId,
              gmail_id: email.gmail_id,
              subject: email.subject,
              body: email.body,
              from_email: email.from,
              to_email: email.to,
              date: email.date,
              embedding: JSON.stringify(embedding) // Store as JSON string
            })
          
          if (!insertError) {
            inserted++
          } else {
            console.error('Insert error:', insertError)
          }
        }
        
      } catch (err) {
        console.error('Error processing email:', err)
        continue
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `Successfully synced ${inserted} new emails`,
      total: emails.length
    })
    
  } catch (error: unknown) {
    console.error('Sync error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Chat failed'
    return NextResponse.json({ 
      error: errorMessage || 'Sync failed' 
    }, { status: 500 })
  }
}