import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { searchAll } from '@/lib/vector-search'
import { chatCompletionWithTools } from '@/lib/openai'
import { sendEmail } from '@/lib/gmail'
import { searchContactByEmail, getHubSpotClient } from '@/lib/hubspot'
import { listEvents, findAvailableSlots, createCalendarEvent, testCalendarAccess } from '@/lib/calendar'
import { createTask, addTaskMessage, updateTask } from '@/lib/tasks'



// Define available tools
const tools: Array<{
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}> = [
    {
      type: 'function',
      function: {
        name: 'send_email',
        description: 'Send an email to someone via Gmail',
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'The recipient email address' },
            subject: { type: 'string', description: 'The email subject line' },
            body: { type: 'string', description: 'The email body content' }
          },
          required: ['to', 'subject', 'body']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'create_hubspot_contact',
        description: 'Create a new contact in HubSpot CRM',
        parameters: {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'The contact email address' },
            firstname: { type: 'string', description: 'The contact first name (optional)' },
            lastname: { type: 'string', description: 'The contact last name (optional)' },
            note: { type: 'string', description: 'An initial note to add about this contact (optional)' }
          },
          required: ['email']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'add_hubspot_note',
        description: 'Add a note to an existing HubSpot contact',
        parameters: {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'The contact email address to add note to' },
            note: { type: 'string', description: 'The note text to add' }
          },
          required: ['email', 'note']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'list_calendar_events',
        description: 'List upcoming events on the user\'s Google Calendar',
        parameters: {
          type: 'object',
          properties: {
            days: { type: 'number', description: 'Number of days to look ahead (default: 7)' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'find_available_times',
        description: 'Find available time slots on the user\'s calendar for scheduling meetings',
        parameters: {
          type: 'object',
          properties: {
            days_ahead: { type: 'number', description: 'How many days ahead to search (default: 7)' },
            duration_minutes: { type: 'number', description: 'Duration of the meeting in minutes (default: 60)' }
          }
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'create_calendar_event',
        description: 'Create a new event on the user\'s Google Calendar',
        parameters: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Event title/summary'
            },
            start_time: {
              type: 'string',
              description: 'Start time in ISO format (e.g., "2024-10-20T14:00:00")'
            },
            duration_minutes: {
              type: 'number',
              description: 'Duration in minutes (default: 60)'
            },
            description: {
              type: 'string',
              description: 'Event description (optional)'
            },
            attendees: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Array of attendee email addresses (optional)'
            },
            location: {
              type: 'string',
              description: 'Meeting location (optional)'
            }
          },
          required: ['title', 'start_time']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'schedule_meeting_with_contact',
        description: 'Schedule a meeting with a contact by finding their info, checking availability, and emailing them with options',
        parameters: {
          type: 'object',
          properties: {
            contact_name: {
              type: 'string',
              description: 'Name of the contact to schedule with (e.g., "Sara Smith")'
            },
            contact_email: {
              type: 'string',
              description: 'Email of the contact (optional if you need to look it up)'
            },
            meeting_duration: {
              type: 'number',
              description: 'Duration in minutes (default: 60)'
            },
            notes: {
              type: 'string',
              description: 'Any additional notes about the meeting purpose'
            }
          },
          required: ['contact_name']
        }
      }
    }
  ]

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const userId = cookieStore.get('user_id')?.value

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { message, conversationHistory = [] } = body

    const { data: user } = await supabase
      .from('users')
      .select('google_access_token, hubspot_access_token')
      .eq('id', userId)
      .single()

    console.log('Searching for:', message)
    const { emails: relevantEmails, contacts: relevantContacts } = await searchAll(userId, message)
    console.log(`Found ${relevantEmails.length} emails, ${relevantContacts.length} contacts`)

    let context = ''

    if (relevantEmails.length > 0) {
      context += 'EMAILS from the user\'s inbox:\n\n'
      relevantEmails.forEach((email: {
        from_email?: string;
        subject?: string;
        body?: string;
      }, i: number) => {
        context += `Email ${i + 1}:\n`
        context += `From: ${email.from_email}\n`
        context += `Subject: ${email.subject}\n`
        context += `Body: ${email.body?.slice(0, 500) || ''}...\n\n`
      })
    }

    if (relevantContacts.length > 0) {
      context += '\nCONTACTS from HubSpot CRM:\n\n'
      relevantContacts.forEach((contact: {
        name?: string;
        email?: string;
        notes?: string;
      }, i: number) => {
        context += `Contact ${i + 1}:\n`
        context += `Name: ${contact.name}\n`
        context += `Email: ${contact.email}\n`
        context += `Notes: ${contact.notes || 'No notes'}\n\n`
      })
    }

    if (!context) {
      context = 'No relevant emails or contacts found.'
    }

    const messages = [
      {
        role: 'system',
        content: `You are an AI assistant for a financial advisor with DIRECT ACCESS to their systems via the following tools.

IMPORTANT: The data provided below is REAL data from the user's accounts.

${context}

YOU HAVE ACCESS TO THESE TOOLS - USE THEM:
- send_email: Send emails via Gmail
- create_hubspot_contact: Create new contacts in HubSpot CRM
- add_hubspot_note: Add notes to existing HubSpot contacts
- list_calendar_events: View upcoming calendar events (USE THIS when user asks about calendar/schedule/meetings)
- find_available_times: Find free time slots for meetings
- create_calendar_event: Schedule new calendar events

IMPORTANT INSTRUCTIONS:
- When the user asks about their calendar/schedule/meetings, ALWAYS use list_calendar_events tool
- When the user asks about availability, ALWAYS use find_available_times tool
- When the user asks to schedule/create an event, ALWAYS use create_calendar_event tool
- Do NOT say you cannot access the calendar - you have the tools to access it
- Be proactive and use the appropriate tool based on the user's request

Answer questions based on the data above and use tools when the user requests actions.`
      },
      ...conversationHistory,
      {
        role: 'user',
        content: message
      }
    ]

    const choice = await chatCompletionWithTools(messages, tools)

    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const toolCall = choice.message.tool_calls[0]

      if ('function' in toolCall && toolCall.function) {
        const functionName = toolCall.function.name
        const args = JSON.parse(toolCall.function.arguments)

        console.log(`Calling tool: ${functionName}`, args)

        // SEND EMAIL
        if (functionName === 'send_email') {
          try {
            if (!user?.google_access_token) {
              return NextResponse.json({
                success: true,
                response: 'I cannot send emails because your Gmail account is not connected properly.',
                emailsFound: relevantEmails.length,
                contactsFound: relevantContacts.length
              })
            }

            await sendEmail(user.google_access_token, args.to, args.subject, args.body)

            return NextResponse.json({
              success: true,
              response: `✓ Email sent to ${args.to}!\n\nSubject: ${args.subject}\n\nBody:\n${args.body}`,
              emailsFound: relevantEmails.length,
              contactsFound: relevantContacts.length,
              actionTaken: 'email_sent'
            })
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            return NextResponse.json({
              success: true,
              response: `Error sending email: ${errorMessage}`,
              emailsFound: relevantEmails.length,
              contactsFound: relevantContacts.length
            })
          }
        }

        // CREATE HUBSPOT CONTACT
        if (functionName === 'create_hubspot_contact') {
          try {
            if (!user?.hubspot_access_token) {
              return NextResponse.json({
                success: true,
                response: 'I cannot create HubSpot contacts because your HubSpot account is not connected.',
                emailsFound: relevantEmails.length,
                contactsFound: relevantContacts.length
              })
            }

            const existing = await searchContactByEmail(user.hubspot_access_token, args.email)

            if (existing.found) {
              return NextResponse.json({
                success: true,
                response: `Contact ${args.email} already exists in HubSpot! Name: ${existing.contact?.firstname} ${existing.contact?.lastname}`,
                emailsFound: relevantEmails.length,
                contactsFound: relevantContacts.length
              })
            }

            const hubspot = await getHubSpotClient(user.hubspot_access_token)
            const result = await hubspot.contacts.create({
              email: args.email,
              firstname: args.firstname || '',
              lastname: args.lastname || ''
            })

            if (args.note && result.contactId) {
              await hubspot.contacts.addNote(result.contactId, args.note)
            }

            let response = `✓ Created new contact in HubSpot!\n\nEmail: ${args.email}`
            if (args.firstname || args.lastname) {
              response += `\nName: ${args.firstname || ''} ${args.lastname || ''}`
            }
            if (args.note) {
              response += `\nNote added: ${args.note}`
            }

            return NextResponse.json({
              success: true,
              response,
              emailsFound: relevantEmails.length,
              contactsFound: relevantContacts.length,
              actionTaken: 'contact_created'
            })
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            return NextResponse.json({
              success: true,
              response: `Error creating contact: ${errorMessage}`,
              emailsFound: relevantEmails.length,
              contactsFound: relevantContacts.length
            })
          }
        }

        // ADD HUBSPOT NOTE
        if (functionName === 'add_hubspot_note') {
          try {
            if (!user?.hubspot_access_token) {
              return NextResponse.json({
                success: true,
                response: 'I cannot add notes because your HubSpot account is not connected.',
                emailsFound: relevantEmails.length,
                contactsFound: relevantContacts.length
              })
            }

            const existing = await searchContactByEmail(user.hubspot_access_token, args.email)

            if (!existing.found || !existing.contact) {
              return NextResponse.json({
                success: true,
                response: `Contact ${args.email} not found in HubSpot. Would you like me to create them first?`,
                emailsFound: relevantEmails.length,
                contactsFound: relevantContacts.length
              })
            }

            const hubspot = await getHubSpotClient(user.hubspot_access_token)
            await hubspot.contacts.addNote(existing.contact.hubspot_id, args.note)

            return NextResponse.json({
              success: true,
              response: `✓ Added note to ${existing.contact.firstname} ${existing.contact.lastname} (${args.email}):\n\n"${args.note}"`,
              emailsFound: relevantEmails.length,
              contactsFound: relevantContacts.length,
              actionTaken: 'note_added'
            })
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            return NextResponse.json({
              success: true,
              response: `Error adding note: ${errorMessage}`,
              emailsFound: relevantEmails.length,
              contactsFound: relevantContacts.length
            })
          }
        }

        // LIST CALENDAR EVENTS
        if (functionName === 'list_calendar_events') {
          console.log('=== CALENDAR HANDLER START ===')

          try {
            if (!user?.google_access_token) {
              console.log('No Google token found')
              return NextResponse.json({
                success: true,
                response: 'I cannot access your calendar because your Google account is not connected.',
                emailsFound: relevantEmails.length,
                contactsFound: relevantContacts.length
              })
            }

            console.log('User has token, testing access...')
            const hasAccess = await testCalendarAccess(user.google_access_token)

            if (!hasAccess) {
              console.log('Token test failed - likely expired')
              return NextResponse.json({
                success: true,
                response: 'Your Google Calendar access has expired. Please reconnect your Google account by logging in again.',
                emailsFound: relevantEmails.length,
                contactsFound: relevantContacts.length
              })
            }

            const days = args.days || 7
            const endDate = new Date()
            endDate.setDate(endDate.getDate() + days)

            console.log('Fetching events...')
            const events = await listEvents(user.google_access_token, new Date(), endDate, 10)
            console.log('Events received:', events.length)

            if (events.length === 0) {
              return NextResponse.json({
                success: true,
                response: `No events found on your calendar for the next ${days} days.`,
                emailsFound: relevantEmails.length,
                contactsFound: relevantContacts.length
              })
            }

            let response = `Here are your upcoming events (next ${days} days):\n\n`
            events.forEach((event, i) => {
              const startDate = new Date(event.start)
              response += `${i + 1}. ${event.summary}\n`
              response += `   When: ${startDate.toLocaleString()}\n`
              if (event.location) response += `   Where: ${event.location}\n`
              if (event.attendees.length > 0) response += `   Attendees: ${event.attendees.join(', ')}\n`
              response += '\n'
            })

            return NextResponse.json({
              success: true,
              response,
              emailsFound: relevantEmails.length,
              contactsFound: relevantContacts.length,
              actionTaken: 'calendar_listed'
            })
          } catch (error: unknown) {
            console.error('=== CALENDAR HANDLER ERROR ===')
            console.error(error)
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            return NextResponse.json({
              success: true,
              response: `Error accessing calendar: ${errorMessage}. Your Google token may have expired - try logging in again.`,
              emailsFound: relevantEmails.length,
              contactsFound: relevantContacts.length
            })
          }
        }

        // FIND AVAILABLE TIMES
        if (functionName === 'find_available_times') {
          try {
            if (!user?.google_access_token) {
              return NextResponse.json({
                success: true,
                response: 'I cannot access your calendar because your Google account is not connected.',
                emailsFound: relevantEmails.length,
                contactsFound: relevantContacts.length
              })
            }

            const daysAhead = args.days_ahead || 7
            const duration = args.duration_minutes || 60

            const startDate = new Date()
            const endDate = new Date()
            endDate.setDate(endDate.getDate() + daysAhead)

            const slots = await findAvailableSlots(user.google_access_token, startDate, endDate, duration)

            if (slots.length === 0) {
              return NextResponse.json({
                success: true,
                response: `No available ${duration}-minute slots found in the next ${daysAhead} days.`,
                emailsFound: relevantEmails.length,
                contactsFound: relevantContacts.length
              })
            }

            let response = `Here are available ${duration}-minute time slots:\n\n`
            slots.forEach((slot, i) => {
              response += `${i + 1}. ${slot.start.toLocaleString()} - ${slot.end.toLocaleTimeString()}\n`
            })

            return NextResponse.json({
              success: true,
              response,
              emailsFound: relevantEmails.length,
              contactsFound: relevantContacts.length,
              actionTaken: 'availability_checked'
            })
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            return NextResponse.json({
              success: true,
              response: `Error checking availability: ${errorMessage}`,
              emailsFound: relevantEmails.length,
              contactsFound: relevantContacts.length
            })
          }
        }

        // CREATE CALENDAR EVENT
        if (functionName === 'create_calendar_event') {
          try {
            if (!user?.google_access_token) {
              return NextResponse.json({
                success: true,
                response: 'I cannot create calendar events because your Google account is not connected.',
                emailsFound: relevantEmails.length,
                contactsFound: relevantContacts.length
              })
            }

            const startTime = new Date(args.start_time)
            const duration = args.duration_minutes || 60
            const endTime = new Date(startTime.getTime() + duration * 60000)

            await createCalendarEvent(
              user.google_access_token,
              args.title,
              startTime,
              endTime,
              args.description,
              args.attendees,
              args.location
            )

            let response = `✓ Calendar event created!\n\n`
            response += `Title: ${args.title}\n`
            response += `When: ${startTime.toLocaleString()}\n`
            response += `Duration: ${duration} minutes\n`
            if (args.location) response += `Location: ${args.location}\n`
            if (args.attendees && args.attendees.length > 0) {
              response += `Attendees: ${args.attendees.join(', ')}\n`
              response += `\n(Calendar invites sent to all attendees)`
            }

            return NextResponse.json({
              success: true,
              response,
              emailsFound: relevantEmails.length,
              contactsFound: relevantContacts.length,
              actionTaken: 'event_created'
            })
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            return NextResponse.json({
              success: true,
              response: `Error creating event: ${errorMessage}`,
              emailsFound: relevantEmails.length,
              contactsFound: relevantContacts.length
            })
          }
        }

        // SCHEDULE MEETING WITH CONTACT
        if (functionName === 'schedule_meeting_with_contact') {
          console.log('=== SCHEDULE MEETING HANDLER ===')

          try {
            if (!user?.google_access_token || !user?.hubspot_access_token) {
              return NextResponse.json({
                success: true,
                response: 'I need access to both your Google Calendar and HubSpot to schedule meetings.',
                emailsFound: relevantEmails.length,
                contactsFound: relevantContacts.length
              })
            }

            const contactName = args.contact_name
            const duration = args.meeting_duration || 60

            console.log('Looking up contact:', contactName)

            // Try to find contact in HubSpot or emails
            let contactEmail = args.contact_email
            let contactInfo = null

            if (!contactEmail) {
              // Search in contacts
              const contacts = await supabase
                .from('contacts')
                .select('*')
                .eq('user_id', userId)
                .ilike('name', `%${contactName}%`)
                .limit(1)

              if (contacts.data && contacts.data.length > 0) {
                contactInfo = contacts.data[0]
                contactEmail = contactInfo.email
                console.log('Found contact in database:', contactEmail)
              }
            }

            if (!contactEmail) {
              return NextResponse.json({
                success: true,
                response: `I couldn't find contact information for ${contactName}. Could you provide their email address?`,
                emailsFound: relevantEmails.length,
                contactsFound: relevantContacts.length
              })
            }

            // Find available times
            const startDate = new Date()
            const endDate = new Date()
            endDate.setDate(endDate.getDate() + 7)

            console.log('Finding available slots...')
            const availableSlots = await findAvailableSlots(
              user.google_access_token,
              startDate,
              endDate,
              duration
            )

            if (availableSlots.length === 0) {
              return NextResponse.json({
                success: true,
                response: 'I couldn\'t find any available time slots in the next week. Please check your calendar.',
                emailsFound: relevantEmails.length,
                contactsFound: relevantContacts.length
              })
            }

            // Take first 3-5 slots
            const proposedTimes = availableSlots.slice(0, 3)

            // Create task to track this scheduling
            const task = await createTask(
              userId,
              'schedule_meeting',
              {
                contact_name: contactName,
                contact_email: contactEmail,
                duration,
                proposed_times: proposedTimes.map(slot => ({
                  start: slot.start.toISOString(),
                  end: slot.end.toISOString()
                })),
                notes: args.notes || ''
              },
              conversationHistory
            )

            if (!task) {
              throw new Error('Failed to create task')
            }

            // Build email with available times
            const timesText = proposedTimes.map((slot, i) =>
              `${i + 1}. ${slot.start.toLocaleDateString()} at ${slot.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            ).join('\n')

            const emailSubject = 'Schedule a Meeting'
            const emailBody = `Hi ${contactName},

I'd like to schedule a meeting with you. Here are some times that work for me:

${timesText}

Please let me know which time works best for you, or suggest an alternative time if none of these work.

Looking forward to connecting!

Best regards`

            // Send the email
            console.log('Sending scheduling email to:', contactEmail)
            await sendEmail(
              user.google_access_token,
              contactEmail,
              emailSubject,
              emailBody
            )

            // Update task to waiting for response
            await updateTask(task.id, {
              status: 'waiting_response',
              waiting_for: `email_reply_from:${contactEmail}`,
              last_action: 'sent_scheduling_email'
            })

            await addTaskMessage(task.id, 'assistant', `Sent scheduling email with ${proposedTimes.length} time options`)

            return NextResponse.json({
              success: true,
              response: `✓ I've emailed ${contactName} (${contactEmail}) with ${proposedTimes.length} available time slots:\n\n${timesText}\n\nI'll monitor for their response and will schedule the meeting once they reply with their preference.`,
              emailsFound: relevantEmails.length,
              contactsFound: relevantContacts.length,
              actionTaken: 'scheduling_initiated',
              taskId: task.id
            })

          } catch (error: unknown) {
            console.error('Schedule meeting error:', error)
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            return NextResponse.json({
              success: true,
              response: `Error scheduling meeting: ${errorMessage}`,
              emailsFound: relevantEmails.length,
              contactsFound: relevantContacts.length
            })
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      response: choice.message.content || 'Sorry, I could not generate a response.',
      emailsFound: relevantEmails.length,
      contactsFound: relevantContacts.length
    })

  } catch (error: unknown) {
    console.error('Chat error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Chat failed'
    return NextResponse.json({
      error: errorMessage || 'Chat failed'
    }, { status: 500 })
  }
}