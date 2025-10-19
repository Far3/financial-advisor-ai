import { google } from 'googleapis'

export async function getCalendarClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  
  oauth2Client.setCredentials({ access_token: accessToken })
  
  return google.calendar({ version: 'v3', auth: oauth2Client })
}

// List upcoming events
export async function listEvents(
  accessToken: string,
  timeMin?: Date,
  timeMax?: Date,
  maxResults = 10
) {
  try {
    const calendar = await getCalendarClient(accessToken)
    
    const now = timeMin || new Date()
    const endTime = timeMax || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: endTime.toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime'
    })
    
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
    console.error('Error listing events:', error)
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
    
    // Get all events in the date range
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
    
    // Check each day
    const currentDate = new Date(startDate)
    
    while (currentDate < endDate) {
      // Skip weekends
      if (currentDate.getDay() === 0 || currentDate.getDay() === 6) {
        currentDate.setDate(currentDate.getDate() + 1)
        continue
      }
      
      // Check each hour in business hours
      for (let hour = businessHourStart; hour < businessHourEnd; hour++) {
        const slotStart = new Date(currentDate)
        slotStart.setHours(hour, 0, 0, 0)
        
        const slotEnd = new Date(slotStart)
        slotEnd.setMinutes(slotEnd.getMinutes() + durationMinutes)
        
        // Check if this slot conflicts with any events
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
      sendUpdates: 'all' // Send email invites to attendees
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