import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getTasksByStatus, updateTask, completeTask, addTaskMessage, findTaskWaitingForEmail, Task } from '@/lib/tasks'
import { chatCompletionWithTools } from '@/lib/openai'
import { createCalendarEvent } from '@/lib/calendar'
import { sendEmail } from '@/lib/gmail'

interface User {
  id: string;
  email: string;
  google_access_token: string;
}

interface Email {
  id: string;
  user_id: string;
  from_email: string;
  from_name?: string;
  subject: string;
  body: string;
  date: string;
}

interface ProposedTime {
  start: string;
  end: string;
}

interface TaskContext {
  contact_name: string;
  contact_email: string;
  duration: number;
  proposed_times?: ProposedTime[];
  notes?: string;
}

interface AIAnalysis {
  selected_slot_index: number | null;
  confidence?: string;
  extracted_time?: string;
  custom_time?: string;
  needs_clarification: boolean;
  response_summary: string;
}

export async function POST() {
  console.log('=== EMAIL MONITOR START ===')
  
  try {
    // Get all users with Google tokens
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, google_access_token')
      .not('google_access_token', 'is', null)
    
    if (usersError) throw usersError
    
    console.log(`Checking ${users?.length || 0} users...`)
    
    let totalProcessed = 0
    
    for (const user of (users || []) as User[]) {
      // Get tasks waiting for response
      const waitingTasks = await getTasksByStatus(user.id, 'waiting_response')
      
      if (waitingTasks.length === 0) continue
      
      console.log(`User ${user.email}: ${waitingTasks.length} waiting tasks`)
      
      // Get recent emails (last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
      
      console.log(`Looking for emails after: ${oneHourAgo.toISOString()}`)
      
      const { data: recentEmails, error: emailError } = await supabase
        .from('emails')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', oneHourAgo.toISOString())
        .order('date', { ascending: false })
      
      if (emailError) {
        console.error('Error fetching emails:', emailError)
        continue
      }
      
      console.log(`Found ${recentEmails?.length || 0} recent emails`)
      
      if (recentEmails && recentEmails.length > 0) {
        console.log('Recent emails:')
        recentEmails.forEach((e: Email) => {
          console.log(`  - From: ${e.from_email}, Date: ${e.date}, Subject: ${e.subject}`)
        })
      }
      
      if (!recentEmails || recentEmails.length === 0) {
        console.log('No recent emails found, skipping user')
        continue
      }
      
      // Check each email against waiting tasks
      for (const email of recentEmails as Email[]) {
        console.log(`\n=== Checking email from ${email.from_email} ===`)
        
        // Find task waiting for this sender
        const task = await findTaskWaitingForEmail(user.id, email.from_email)
        
        if (!task) {
          console.log(`No task found waiting for ${email.from_email}`)
          continue
        }
        
        console.log(`📧 MATCH! Found reply from ${email.from_email} for task ${task.id}`)
        console.log(`Task status: ${task.status}`)
        console.log(`Task waiting_for: ${task.waiting_for}`)
        
        // Process this response
        await processTaskResponse(user, task, email)
        totalProcessed++
      }
    }
    
    console.log(`\n=== MONITOR COMPLETE: Processed ${totalProcessed} responses ===`)
    
    return NextResponse.json({
      success: true,
      message: `Processed ${totalProcessed} task responses`
    })
    
  } catch (error) {
    console.error('Monitor error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Monitor failed'
    }, { status: 500 })
  }
}

async function processTaskResponse(
  user: User,
  task: Task,
  email: Email
) {
  console.log(`Processing task ${task.id} of type ${task.type}`)
  
  if (task.type === 'schedule_meeting') {
    await processScheduleMeetingResponse(user, task, email)
  }
  
  // Add more task types here as needed
}

async function processScheduleMeetingResponse(
  user: User,
  task: Task,
  email: Email
) {
  try {
    const context = task.context as unknown as TaskContext
    
    console.log('=== Processing Schedule Response ===')
    console.log('Contact:', context.contact_email)
    console.log('Email body:', email.body)
    console.log('Proposed times:', context.proposed_times)
    
    // Use AI to parse the email and extract selected time
    const messages = [
      {
        role: 'system' as const,
        content: `You are analyzing an email response to a meeting scheduling request.

ORIGINAL PROPOSED TIMES:
${context.proposed_times?.map((t: ProposedTime, i: number) => 
  `${i + 1}. ${new Date(t.start).toLocaleString()}`
).join('\n')}

EMAIL RESPONSE:
From: ${email.from_email}
Subject: ${email.subject}
Body: ${email.body}

TASK: Determine which time slot the person selected. Look for:
- Numbers like "1", "2", "3", "option 1", "first one"
- Times like "10am", "2pm", "10:00", "11am"
- Days like "Monday", "Tuesday"
- Phrases like "works for me", "sounds good", "that time works"

If they mention a specific time (like "10am"), find which proposed slot matches that time.

Respond in JSON format ONLY:
{
  "selected_slot_index": <number 0-2 for which slot, or null>,
  "confidence": <"high" | "medium" | "low">,
  "extracted_time": "<the time they mentioned>",
  "needs_clarification": <boolean>,
  "response_summary": "<brief summary>"
}`
      }
    ]
    
    const response = await chatCompletionWithTools(messages, [])
    const analysis: AIAnalysis = JSON.parse(response.message.content || '{}')
    
    console.log('AI Analysis:', analysis)
    
    await addTaskMessage(task.id, 'system', `Received reply: ${analysis.response_summary}`)
    
    // If low confidence or needs clarification, ask again
    if (analysis.needs_clarification || analysis.confidence === 'low') {
      console.log('Needs clarification, sending follow-up')
      
      await sendEmail(
        user.google_access_token,
        email.from_email,
        'Re: ' + email.subject,
        `Hi ${context.contact_name},

Thanks for your response! Just to confirm, which time works best for you?

${context.proposed_times?.map((t: ProposedTime, i: number) => 
  `${i + 1}. ${new Date(t.start).toLocaleString('en-US', { 
    weekday: 'long',
    month: 'long', 
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true 
  })}`
).join('\n')}

Please reply with the number (1, 2, or 3) that works best.

Best regards`
      )
      
      await addTaskMessage(task.id, 'assistant', 'Sent clarification request')
      return
    }
    
    // Determine final meeting time
    let meetingStart: Date
    let meetingEnd: Date
    
    if (analysis.selected_slot_index !== null && 
        analysis.selected_slot_index !== undefined && 
        context.proposed_times &&
        context.proposed_times[analysis.selected_slot_index]) {
      
      const slot = context.proposed_times[analysis.selected_slot_index]
      meetingStart = new Date(slot.start)
      meetingEnd = new Date(slot.end)
      
      console.log(`Selected slot ${analysis.selected_slot_index + 1}: ${meetingStart.toISOString()}`)
      
    } else if (analysis.custom_time) {
      meetingStart = new Date(analysis.custom_time)
      meetingEnd = new Date(meetingStart.getTime() + context.duration * 60000)
      
      console.log(`Custom time: ${meetingStart.toISOString()}`)
      
    } else if (analysis.extracted_time) {
      // Try to parse extracted time
      meetingStart = new Date(analysis.extracted_time)
      if (isNaN(meetingStart.getTime())) {
        throw new Error('Could not parse extracted time')
      }
      meetingEnd = new Date(meetingStart.getTime() + context.duration * 60000)
      
      console.log(`Parsed extracted time: ${meetingStart.toISOString()}`)
      
    } else {
      throw new Error('Could not determine meeting time from response')
    }
    
    console.log(`Creating calendar event: ${meetingStart.toISOString()}`)
    
    // Create calendar event
    await createCalendarEvent(
      user.google_access_token,
      `Meeting with ${context.contact_name}`,
      meetingStart,
      meetingEnd,
      context.notes || `Scheduled via AI assistant`,
      [email.from_email]
    )
    
    await addTaskMessage(task.id, 'system', `Created calendar event for ${meetingStart.toISOString()}`)
    
    // Send confirmation email
    await sendEmail(
      user.google_access_token,
      email.from_email,
      'Meeting Confirmed ✓',
      `Hi ${context.contact_name},

Perfect! I've scheduled our meeting for:

📅 ${meetingStart.toLocaleDateString('en-US', { 
  weekday: 'long',
  month: 'long', 
  day: 'numeric',
  year: 'numeric'
})}

⏰ ${meetingStart.toLocaleTimeString('en-US', { 
  hour: 'numeric',
  minute: '2-digit',
  hour12: true 
})}

You should receive a calendar invitation shortly.

Looking forward to it!

Best regards`
    )
    
    await addTaskMessage(task.id, 'assistant', 'Sent confirmation email and created calendar event')
    
    // Complete the task
    await completeTask(task.id, {
      ...context,
      final_meeting_time: meetingStart.toISOString(),
      completed_action: 'meeting_scheduled',
      selected_slot: analysis.selected_slot_index
    })
    
    console.log('✅ Meeting scheduled and task completed!')
    
  } catch (error) {
    console.error('Error processing schedule meeting response:', error)
    
    await updateTask(task.id, {
      status: 'failed',
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error',
        email_body: email.body,
        timestamp: new Date().toISOString()
      }
    })
    
    await addTaskMessage(task.id, 'system', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}