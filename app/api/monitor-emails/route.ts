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
  from_name: string;
  subject: string;
  body: string;
  received_at: string;
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
      
      const { data: recentEmails } = await supabase
        .from('emails')
        .select('*')
        .eq('user_id', user.id)
        .gte('received_at', oneHourAgo.toISOString())
        .order('received_at', { ascending: false })
      
      if (!recentEmails || recentEmails.length === 0) continue
      
      console.log(`Found ${recentEmails.length} recent emails`)
      
      // Check each email against waiting tasks
      for (const email of recentEmails as Email[]) {
        // Find task waiting for this sender
        const task = await findTaskWaitingForEmail(user.id, email.from_email)
        
        if (!task) continue
        
        console.log(`📧 Found reply from ${email.from_email} for task ${task.id}`)
        
        // Process this response
        await processTaskResponse(user, task, email)
        totalProcessed++
      }
    }
    
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
    // Cast through unknown to avoid TypeScript error
    const context = task.context as unknown as TaskContext
    
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

TASK: Determine which time slot the person selected (or if they suggested a new time).

Respond in JSON format:
{
  "selected_slot_index": <number 0-based index of selected time, or null>,
  "custom_time": "<ISO datetime string if they suggested different time>",
  "needs_clarification": <boolean>,
  "response_summary": "<brief summary of their response>"
}`
      }
    ]
    
    const response = await chatCompletionWithTools(messages, [])
    const analysis: AIAnalysis = JSON.parse(response.message.content || '{}')
    
    console.log('AI Analysis:', analysis)
    
    await addTaskMessage(task.id, 'system', `Received reply: ${analysis.response_summary}`)
    
    if (analysis.needs_clarification) {
      // Need more info - send clarification email
      await sendEmail(
        user.google_access_token,
        email.from_email,
        'Re: ' + email.subject,
        `Hi ${context.contact_name},\n\nThanks for your response! Could you please clarify which time works best for you? Here are the options again:\n\n${context.proposed_times?.map((t: ProposedTime, i: number) => 
          `${i + 1}. ${new Date(t.start).toLocaleString()}`
        ).join('\n')}\n\nBest regards`
      )
      
      await addTaskMessage(task.id, 'assistant', 'Sent clarification request')
      return
    }
    
    // Determine final meeting time
    let meetingStart: Date
    let meetingEnd: Date
    
    if (analysis.selected_slot_index !== null && analysis.selected_slot_index !== undefined && context.proposed_times) {
      const slot = context.proposed_times[analysis.selected_slot_index]
      meetingStart = new Date(slot.start)
      meetingEnd = new Date(slot.end)
    } else if (analysis.custom_time) {
      meetingStart = new Date(analysis.custom_time)
      meetingEnd = new Date(meetingStart.getTime() + context.duration * 60000)
    } else {
      throw new Error('Could not determine meeting time')
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
      'Meeting Confirmed',
      `Hi ${context.contact_name},

Perfect! I've scheduled our meeting for:

📅 ${meetingStart.toLocaleDateString()}
⏰ ${meetingStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}

You should receive a calendar invitation shortly.

Looking forward to it!

Best regards`
    )
    
    await addTaskMessage(task.id, 'assistant', 'Sent confirmation email')
    
    // Complete the task
    await completeTask(task.id, {
      ...context,
      final_meeting_time: meetingStart.toISOString(),
      completed_action: 'meeting_scheduled'
    })
    
    console.log('✅ Meeting scheduled and task completed!')
    
  } catch (error) {
    console.error('Error processing schedule meeting response:', error)
    
    await updateTask(task.id, {
      status: 'failed',
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    })
  }
}