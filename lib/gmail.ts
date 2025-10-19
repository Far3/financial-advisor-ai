import { google } from 'googleapis'

export async function getGmailClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  
  oauth2Client.setCredentials({ access_token: accessToken })
  
  return google.gmail({ version: 'v1', auth: oauth2Client })
}

export async function fetchEmails(accessToken: string, maxResults = 20) {
  try {
    const gmail = await getGmailClient(accessToken)
    
    // Get list of message IDs
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      q: 'in:inbox OR in:sent' // Get both inbox and sent
    })
    
    const messages = listResponse.data.messages || []
    
    // Fetch full details for each message
    const emailDetails = await Promise.all(
      messages.map(async (message) => {
        const details = await gmail.users.messages.get({
          userId: 'me',
          id: message.id!,
          format: 'full'
        })
        
        const headers = details.data.payload?.headers || []
        const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)'
        const from = headers.find(h => h.name === 'From')?.value || ''
        const to = headers.find(h => h.name === 'To')?.value || ''
        const date = headers.find(h => h.name === 'Date')?.value || ''
        
        // Get email body
        let body = ''
        const parts = details.data.payload?.parts || []
        
        // Simple body extraction
        if (details.data.payload?.body?.data) {
          body = Buffer.from(details.data.payload.body.data, 'base64').toString()
        } else if (parts.length > 0) {
          const textPart = parts.find(p => p.mimeType === 'text/plain')
          if (textPart?.body?.data) {
            body = Buffer.from(textPart.body.data, 'base64').toString()
          }
        }
        
        return {
          gmail_id: message.id!,
          subject,
          from,
          to,
          date: new Date(date),
          body: body.slice(0, 8000) // Limit body size
        }
      })
    )
    
    return emailDetails
    
  } catch (error) {
    console.error('Error fetching emails:', error)
    throw error
  }
}

export async function sendEmail(
  accessToken: string,
  to: string,
  subject: string,
  body: string
) {
  try {
    const gmail = await getGmailClient(accessToken)
    
    // Create email in RFC 2822 format
    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body
    ].join('\n')
    
    // Encode email in base64
    const encodedEmail = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    
    // Send via Gmail API
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedEmail
      }
    })
    
    return {
      success: true,
      messageId: response.data.id
    }
    
  } catch (error) {
    console.error('Error sending email:', error)
    throw error
  }
}