import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { searchAll } from '@/lib/vector-search'
import { chatCompletionWithTools } from '@/lib/openai'
import { sendEmail } from '@/lib/gmail'
import { searchContactByEmail, getHubSpotClient } from '@/lib/hubspot'

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
            to: {
              type: 'string',
              description: 'The recipient email address'
            },
            subject: {
              type: 'string',
              description: 'The email subject line'
            },
            body: {
              type: 'string',
              description: 'The email body content'
            }
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
            email: {
              type: 'string',
              description: 'The contact email address'
            },
            firstname: {
              type: 'string',
              description: 'The contact first name (optional)'
            },
            lastname: {
              type: 'string',
              description: 'The contact last name (optional)'
            },
            note: {
              type: 'string',
              description: 'An initial note to add about this contact (optional)'
            }
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
            email: {
              type: 'string',
              description: 'The contact email address to add note to'
            },
            note: {
              type: 'string',
              description: 'The note text to add'
            }
          },
          required: ['email', 'note']
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

    // Get user's tokens for Gmail and HubSpot
    const { data: user } = await supabase
      .from('users')
      .select('google_access_token, hubspot_access_token')
      .eq('id', userId)
      .single()

    // Search for relevant emails AND contacts
    console.log('Searching for:', message)
    const { emails: relevantEmails, contacts: relevantContacts } = await searchAll(userId, message)
    console.log(`Found ${relevantEmails.length} emails, ${relevantContacts.length} contacts`)

    // Build context from emails and contacts
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
        content: `You are an AI assistant for a financial advisor with access to their emails, HubSpot CRM, and various tools.

IMPORTANT: The data provided below is REAL data from the user's accounts.

${context}

AVAILABLE TOOLS:
- send_email: Send emails via Gmail
- create_hubspot_contact: Create new contacts in HubSpot CRM
- add_hubspot_note: Add notes to existing HubSpot contacts

When using tools:
- Be professional and concise
- Confirm actions clearly
- Handle errors gracefully

Answer questions based on the data above and use tools when the user requests actions.`
      },
      ...conversationHistory,
      {
        role: 'user',
        content: message
      }
    ]

    // Get GPT response with function calling
    const choice = await chatCompletionWithTools(messages, tools)

    // Check if GPT wants to call a function
    // Check if GPT wants to call a function
    if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
      const toolCall = choice.message.tool_calls[0]

      // Type guard for function tool calls
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

            await sendEmail(
              user.google_access_token,
              args.to,
              args.subject,
              args.body
            )

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

            // Check if contact already exists
            const existing = await searchContactByEmail(user.hubspot_access_token, args.email)

            if (existing.found) {
              return NextResponse.json({
                success: true,
                response: `Contact ${args.email} already exists in HubSpot! Name: ${existing.contact?.firstname} ${existing.contact?.lastname}`,
                emailsFound: relevantEmails.length,
                contactsFound: relevantContacts.length
              })
            }

            // Create the contact
            const hubspot = await getHubSpotClient(user.hubspot_access_token)
            const result = await hubspot.contacts.create({
              email: args.email,
              firstname: args.firstname || '',
              lastname: args.lastname || ''
            })

            // Add initial note if provided
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

            // Find the contact
            const existing = await searchContactByEmail(user.hubspot_access_token, args.email)

            if (!existing.found || !existing.contact) {
              return NextResponse.json({
                success: true,
                response: `Contact ${args.email} not found in HubSpot. Would you like me to create them first?`,
                emailsFound: relevantEmails.length,
                contactsFound: relevantContacts.length
              })
            }

            // Add the note
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
      }
    }

    // Regular response (no tool call)
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