import { google } from 'googleapis'

// Timeout helper
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
  })
  return Promise.race([promise, timeout])
}

export async function getCalendarClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  
  oauth2Client.setCredentials({ access_token: accessToken })
  
  return google.calendar({ version: 'v3', auth: oauth2Client })
}

// Test if token is valid
export async function testCalendarAccess(accessToken: string): Promise<boolean> {
  try {
    console.log('Testing calendar access...')
    const calendar = await getCalendarClient(accessToken)
    
    await withTimeout(
      calendar.calendarList.list({ maxResults: 1 }),
      5000
    )
    
    console.log('✓ Calendar access test passed')
    return true
  } catch (error) {
    console.error('✗ Calendar access test failed:', error)
    return false
  }
}

// List upcoming events
export async function listEvents(
  accessToken: string,
  timeMin?: Date,
  timeMax?: Date,
  maxResults = 10
) {
  console.log('=== CALENDAR LIST EVENTS START ===')
  console.log('Token exists:', !!accessToken)
  console.log('Token preview:', accessToken?.substring(0, 20) + '...')
  
  try {
    const calendar = await getCalendarClient(accessToken)
    
    const now = timeMin || new Date()
    const endTime = timeMax || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    
    console.log('Fetching events...')
    console.log('From:', now.toISOString())
    console.log('To:', endTime.toISOString())
    
    const response = await withTimeout(
      calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: endTime.toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: 'startTime'
      }),
      10000
    )
    
    console.log('✓ Calendar API responded')
    console.log('Events found:', response.data.items?.length || 0)
    
    const events = response.data.items || []
    
    return events.map(event => ({
      id: event.id || '',
      summary: event.summary || 'No title',
      description: event.description || '',
      start: event.start?.dateTime || event.start?.date || '',
      end: event.end?.dateTime || event.end?.date || '',
      attendees: event.attendees?.map(a => a.email) || [],
      location: event.location || ''
    }))
    
  } catch (error) {
    console.error('=== CALENDAR ERROR ===')
    if (error instanceof Error) {
      console.error('Error message:', error.message)
      console.error('Error name:', error.name)
    }
    console.error('Full error:', JSON.stringify(error, null, 2))
    throw error
  }
}

// Check if a specific time slot is available
export async function checkAvailability(
  accessToken: string,
  startTime: Date,
  endTime: Date
) {
  try {
    const calendar = await getCalendarClient(accessToken)
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startTime.toISOString(),
      timeMax: endTime.toISOString(),
      singleEvents: true
    })
    
    const events = response.data.items || []
    
    return {
      available: events.length === 0,
      conflictingEvents: events.map(e => ({
        summary: e.summary || 'Busy',
        start: e.start?.dateTime || e.start?.date || '',
        end: e.end?.dateTime || e.end?.date || ''
      }))
    }
    
  } catch (error) {
    console.error('Error checking availability:', error)
    throw error
  }
}

// Find available time slots
export async function findAvailableSlots(
  accessToken: string,
  startDate: Date,
  endDate: Date,
  durationMinutes = 60
) {
  try {
    const calendar = await getCalendarClient(accessToken)
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: 'startTime'
    })
    
    const events = response.data.items || []
    const availableSlots: Array<{ start: Date; end: Date }> = []
    
    // Business hours: 9 AM - 5 PM
    const businessHourStart = 9
    const businessHourEnd = 17
    
    const currentDate = new Date(startDate)
    
    while (currentDate < endDate) {
      // Skip weekends
      if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
        currentDate.setDate(currentDate.getDate() + 1)
        continue
      }
      
      for (let hour = businessHourStart; hour < businessHourEnd; hour++) {
        const slotStart = new Date(currentDate)
        slotStart.setHours(hour, 0, 0, 0)
        
        const slotEnd = new Date(slotStart)
        slotEnd.setMinutes(slotEnd.getMinutes() + durationMinutes)
        
        const hasConflict = events.some(event => {
          const eventStart = new Date(event.start?.dateTime || event.start?.date || '')
          const eventEnd = new Date(event.end?.dateTime || event.end?.date || '')
          
          return (slotStart < eventEnd && slotEnd > eventStart)
        })
        
        if (!hasConflict && availableSlots.length < 5) {
          availableSlots.push({ start: slotStart, end: slotEnd })
        }
      }
      
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return availableSlots
    
  } catch (error) {
    console.error('Error finding available slots:', error)
    throw error
  }
}

// Create a calendar event
export async function createCalendarEvent(
  accessToken: string,
  summary: string,
  startTime: Date,
  endTime: Date,
  description?: string,
  attendees?: string[],
  location?: string
) {
  try {
    const calendar = await getCalendarClient(accessToken)
    
    const event = {
      summary,
      description,
      location,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'America/New_York'
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'America/New_York'
      },
      attendees: attendees?.map(email => ({ email })),
      reminders: {
        useDefault: true
      }
    }
    
    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'all'
    })
    
    return {
      success: true,
      eventId: response.data.id,
      htmlLink: response.data.htmlLink,
      event: response.data
    }
    
  } catch (error) {
    console.error('Error creating event:', error)
    throw error
  }
}