import { supabase } from './supabase'

export async function searchEmails(userId: string, query: string, limit = 5) {
  console.log('=== EMAIL SEARCH DEBUG ===')
  console.log('User ID:', userId)
  console.log('Query:', query)
  
  const results = await fallbackTextSearch(userId, query, limit)
  console.log('Email results found:', results.length)
  
  return results
}

export async function searchContacts(userId: string, query: string, limit = 5) {
  console.log('=== CONTACT SEARCH DEBUG ===')
  console.log('User ID:', userId)
  console.log('Query:', query)
  
  try {
    // First check if ANY contacts exist
    const { data: allContacts } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
    
    console.log('Total contacts in DB:', allContacts?.length || 0)
    
    if (!allContacts || allContacts.length === 0) {
      console.log('No contacts found for this user')
      return []
    }
    
    // Always show contacts for debugging
    // console.log('Sample contact:', allContacts[0])
    
    // Check if it's a general query
    const generalQueryPatterns = [
      'client',
      'contact',
      'who',
      'list',
      'show',
      'tell',
      'access',
      'hubspot'
    ]
    
    const queryLower = query.toLowerCase()
    const isGeneralQuery = generalQueryPatterns.some(pattern => 
      queryLower.includes(pattern)
    )
    
    console.log('Is general query?', isGeneralQuery)
    
    if (isGeneralQuery) {
      console.log('Returning all contacts')
      return allContacts.slice(0, limit)
    }
    
    // Specific search
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('user_id', userId)
      .or(`name.ilike.%${query}%,email.ilike.%${query}%,notes.ilike.%${query}%`)
      .limit(limit)
    
    console.log('Specific search results:', data?.length || 0)
    
    if (error) {
      console.error('Contact search error:', error)
    }
    
    return data || allContacts.slice(0, limit)
    
  } catch (error) {
    console.error('Contact search error:', error)
    return []
  }
}

export async function searchAll(userId: string, query: string) {
  console.log('=== SEARCHING ALL DATA ===')
  console.log('Query:', query)
  
  const [emails, contacts] = await Promise.all([
    searchEmails(userId, query, 3),
    searchContacts(userId, query, 5)
  ])
  
  console.log(`✓ FINAL: Found ${emails.length} emails, ${contacts.length} contacts`)
  
  return { emails, contacts }
}

async function fallbackTextSearch(userId: string, query: string, limit: number) {
  const { data: allEmails } = await supabase
    .from('emails')
    .select('*')
    .eq('user_id', userId)
  
  console.log('Total emails for user:', allEmails?.length || 0)
  
  const { data, error } = await supabase
    .from('emails')
    .select('*')
    .eq('user_id', userId)
    .or(`subject.ilike.%${query}%,body.ilike.%${query}%`)
    .limit(limit)
  
  console.log('Text search results:', data?.length || 0)
  
  if (error) {
    console.error('Text search error:', error)
  }
  
  if (!data || data.length === 0) {
    console.log('No text matches, returning all emails')
    return allEmails?.slice(0, limit) || []
  }
  
  return data || []
}