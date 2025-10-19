import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import { searchEmails } from '@/lib/vector-search'
import { chatCompletionWithTools } from '@/lib/openai'
import { sendEmail } from '@/lib/gmail'

// Define available tools
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

    // Get user's Google token for sending emails
    const { data: user } = await supabase
      .from('users')
      .select('google_access_token')
      .eq('id', userId)
      .single()

    // Search for relevant emails
    console.log('Searching for:', message)
    const relevantEmails = await searchEmails(userId, message, 20)
    console.log(`Found ${relevantEmails.length} relevant emails`)

    // Build context from emails
    let context = ''
    if (relevantEmails.length > 0) {
      context = 'Here are relevant emails from the user\'s inbox:\n\n'
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

    // Build messages for GPT with tools
    const messages = [
      {
        role: 'system',
        content: `You are an AI assistant for a financial advisor with access to their emails and the ability to send emails.

IMPORTANT: The emails provided below are REAL emails from the user's inbox. Use them to answer questions.

You can also send emails using the send_email function when the user asks you to.

${context}

When sending emails:
- Keep them professional and concise
- Use appropriate subject lines
- Confirm before sending if unclear

Answer questions based on the email data above.`
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
if (choice.message.tool_calls && choice.message.tool_calls.length > 0) {
  const toolCall = choice.message.tool_calls[0]
  
  // Check if it's a function tool call
  if (toolCall.type === 'function' && toolCall.function.name === 'send_email') {
    const args = JSON.parse(toolCall.function.arguments)

        console.log('Sending email:', args)

        try {
          if (!user?.google_access_token) {
            return NextResponse.json({
              success: true,
              response: 'I cannot send emails because your Gmail account is not connected properly. Please reconnect.',
              emailsFound: relevantEmails.length
            })
          }

          // Actually send the email
          await sendEmail(
            user.google_access_token,
            args.to,
            args.subject,
            args.body
          )

          return NextResponse.json({
            success: true,
            response: `✓ Email sent successfully to ${args.to}!\n\nSubject: ${args.subject}\n\nBody:\n${args.body}`,
            emailsFound: relevantEmails.length,
            actionTaken: 'email_sent'
          })

        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error'
          return NextResponse.json({
            success: true,
            response: `I tried to send the email but encountered an error: ${errorMessage}. Your Gmail token might need to be refreshed.`,
            emailsFound: relevantEmails.length
          })
        }
      }
    }

    // Regular response (no tool call)
    return NextResponse.json({
      success: true,
      response: choice.message.content || 'Sorry, I could not generate a response.',
      emailsFound: relevantEmails.length
    })

  } catch (error: unknown) {
    console.error('Chat error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Chat failed'
    return NextResponse.json({
      error: errorMessage || 'Chat failed'
    }, { status: 500 })
  }
}