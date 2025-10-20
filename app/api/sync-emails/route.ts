import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { google } from 'googleapis'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

interface MessagePart {
  mimeType?: string;
  body?: {
    data?: string;
  };
  parts?: MessagePart[];
}

export async function POST() {
  console.log('=== EMAIL SYNC START ===')
  
  try {
    // Get all users with Gmail tokens
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, google_access_token')
      .not('google_access_token', 'is', null)
    
    if (usersError) throw usersError
    
    console.log(`Syncing emails for ${users?.length || 0} users...`)
    
    let totalSynced = 0
    
    for (const user of users || []) {
      try {
        console.log(`\n=== Syncing for ${user.email} ===`)
        
        // Setup Gmail API
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI
        )
        oauth2Client.setCredentials({ 
          access_token: user.google_access_token 
        })
        
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client })
        
        // Get last sync time (check most recent email)
        const { data: lastEmail } = await supabase
          .from('emails')
          .select('date')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle()
        
        // Build query - get emails from last hour or since last sync
        let afterTimestamp = Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
        
        if (lastEmail?.date) {
          const lastEmailDate = new Date(lastEmail.date)
          afterTimestamp = Math.floor(lastEmailDate.getTime() / 1000) - 300 // 5 min overlap
        }
        
        const query = `in:inbox after:${afterTimestamp}`
        console.log(`Query: ${query}`)
        
        // Fetch messages
        const { data: listData } = await gmail.users.messages.list({
          userId: 'me',
          q: query,
          maxResults: 50
        })
        
        if (!listData.messages || listData.messages.length === 0) {
          console.log('No new messages found')
          continue
        }
        
        console.log(`Found ${listData.messages.length} messages to process`)
        
        for (const message of listData.messages) {
          try {
            // Check if already exists
            const { data: existing } = await supabase
              .from('emails')
              .select('id')
              .eq('gmail_id', message.id!)
              .maybeSingle()
            
            if (existing) {
              console.log(`Email ${message.id} already exists, skipping`)
              continue
            }
            
            // Get full message
            const { data: fullMessage } = await gmail.users.messages.get({
              userId: 'me',
              id: message.id!,
              format: 'full'
            })
            
            // Parse headers
            const headers = fullMessage.payload?.headers || []
            const getHeader = (name: string) => 
              headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''
            
            const subject = getHeader('Subject')
            const from = getHeader('From')
            const to = getHeader('To')
            const dateStr = getHeader('Date')
            
            // Extract email addresses
            const fromEmail = from.match(/<(.+?)>/)?.[1] || from.trim()
            const toEmail = to.match(/<(.+?)>/)?.[1] || to.trim()
            
            // Get body - recursive function with proper typing
            const getPart = (part: MessagePart): string => {
              if (part.mimeType === 'text/plain' && part.body?.data) {
                return Buffer.from(part.body.data, 'base64').toString('utf-8')
              }
              if (part.parts) {
                for (const subPart of part.parts) {
                  const text = getPart(subPart)
                  if (text) return text
                }
              }
              return ''
            }
            
            let body = ''
            if (fullMessage.payload) {
              body = getPart(fullMessage.payload as MessagePart)
            }
            
            // Clean and limit body
            body = body
              .replace(/\r\n/g, '\n')
              .replace(/\n{3,}/g, '\n\n')
              .trim()
              .slice(0, 2000)
            
            // Parse date
            const emailDate = new Date(dateStr)
            
            console.log(`Processing: ${fromEmail} - "${subject}"`)
            
            // Generate embedding
            const embeddingText = `${subject} ${body}`.slice(0, 8000)
            const embeddingResponse = await openai.embeddings.create({
              model: 'text-embedding-3-small',
              input: embeddingText
            })
            
            const embedding = embeddingResponse.data[0].embedding
            
            // Insert email
            const { error: insertError } = await supabase
              .from('emails')
              .insert({
                user_id: user.id,
                gmail_id: message.id!,
                from_email: fromEmail,
                to_email: toEmail,
                subject: subject,
                body: body,
                date: emailDate.toISOString(),
                embedding: embedding
              })
            
            if (insertError) {
              console.error(`Error inserting email ${message.id}:`, insertError)
              continue
            }
            
            console.log(`✅ Synced: ${fromEmail} - "${subject}"`)
            totalSynced++
            
          } catch (msgError) {
            console.error(`Error processing message ${message.id}:`, msgError)
          }
        }
        
      } catch (userError) {
        console.error(`Error syncing user ${user.email}:`, userError)
      }
    }
    
    console.log(`\n=== EMAIL SYNC COMPLETE: ${totalSynced} emails synced ===`)
    
    return NextResponse.json({
      success: true,
      synced: totalSynced,
      message: `Synced ${totalSynced} emails`
    })
    
  } catch (error) {
    console.error('Email sync error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Sync failed'
    }, { status: 500 })
  }
}