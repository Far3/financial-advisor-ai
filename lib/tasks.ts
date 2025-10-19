import { supabase } from './supabase'

export interface Task {
  id: string;
  user_id: string;
  type: string;
  status: 'pending' | 'waiting_response' | 'in_progress' | 'completed' | 'failed';
  context: Record<string, unknown>;
  conversation_history: Array<{ role: string; content: string }>;
  metadata: Record<string, unknown>;
  waiting_for?: string;
  last_action?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

// Create a new task
export async function createTask(
  userId: string,
  type: string,
  context: Record<string, unknown>,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<Task | null> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        type,
        status: 'pending',
        context,
        conversation_history: conversationHistory
      })
      .select()
      .single()
    
    if (error) throw error
    console.log('✓ Task created:', data.id)
    return data as Task
  } catch (error) {
    console.error('Error creating task:', error)
    return null
  }
}

// Update task
export async function updateTask(
  taskId: string,
  updates: {
    status?: Task['status'];
    context?: Record<string, unknown>;
    conversation_history?: Array<{ role: string; content: string }>;
    waiting_for?: string;
    last_action?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<Task | null> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId)
      .select()
      .single()
    
    if (error) throw error
    console.log('✓ Task updated:', taskId)
    return data as Task
  } catch (error) {
    console.error('Error updating task:', error)
    return null
  }
}

// Complete a task
export async function completeTask(taskId: string, finalContext?: Record<string, unknown>): Promise<boolean> {
  try {
    const updates: Record<string, unknown> = {
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
    
    if (finalContext) {
      updates.context = finalContext
    }
    
    const { error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', taskId)
    
    if (error) throw error
    console.log('✓ Task completed:', taskId)
    return true
  } catch (error) {
    console.error('Error completing task:', error)
    return false
  }
}

// Get tasks by status
export async function getTasksByStatus(
  userId: string,
  status: Task['status']
): Promise<Task[]> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('status', status)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return (data || []) as Task[]
  } catch (error) {
    console.error('Error fetching tasks:', error)
    return []
  }
}

// Get task by ID
export async function getTask(taskId: string): Promise<Task | null> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single()
    
    if (error) throw error
    return data as Task
  } catch (error) {
    console.error('Error fetching task:', error)
    return null
  }
}

// Find task waiting for specific email
export async function findTaskWaitingForEmail(
  userId: string,
  fromEmail: string
): Promise<Task | null> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'waiting_response')
      .ilike('waiting_for', `%${fromEmail}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return null // No rows found
      throw error
    }
    
    return data as Task
  } catch (error) {
    console.error('Error finding task:', error)
    return null
  }
}

// Add message to task conversation
export async function addTaskMessage(
  taskId: string,
  role: 'user' | 'assistant' | 'system',
  content: string
): Promise<boolean> {
  try {
    const task = await getTask(taskId)
    if (!task) return false
    
    const updatedHistory = [
      ...task.conversation_history,
      { role, content }
    ]
    
    await updateTask(taskId, {
      conversation_history: updatedHistory
    })
    
    return true
  } catch (error) {
    console.error('Error adding task message:', error)
    return false
  }
}