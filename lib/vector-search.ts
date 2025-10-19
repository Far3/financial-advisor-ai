// import { supabase } from './supabase'
// import { generateEmbedding } from './openai'

// export async function searchEmails(userId: string, query: string, limit = 5) {
//   try {
//     // Generate embedding for the user's question
//     const queryEmbedding = await generateEmbedding(query)
    
//     // Search for similar emails using cosine similarity
//     // Note: We need to use Supabase RPC for vector search
//     const { data, error } = await supabase.rpc('match_emails', {
//       query_embedding: JSON.stringify(queryEmbedding),
//       match_threshold: 0.5,
//       match_count: limit,
//       user_id_param: userId
//     })

//     console.log('within vector search', data)
    
//     if (error) {
//       console.error('Vector search error:', error)
//       // Fallback to simple text search if vector search fails
//       return await fallbackTextSearch(userId, query, limit)
//     }
    
//     return data || []
    
//   } catch (error) {
//     console.error('Search error:', error)
//     return await fallbackTextSearch(userId, query, limit)
//   }
// }

// // Fallback text search if vector search fails
// async function fallbackTextSearch(userId: string, query: string, limit: number) {
//   const { data, error } = await supabase
//     .from('emails')
//     .select('*')
//     .eq('user_id', userId)
//     .or(`subject.ilike.%${query}%,body.ilike.%${query}%`)
//     .limit(limit)
  
//   return data || []
// }

import { supabase } from './supabase'
import { generateEmbedding } from './openai'

export async function searchEmails(userId: string, query: string, limit = 5) {
  console.log('=== SEARCH DEBUG ===')
  console.log('User ID:', userId)
  console.log('Query:', query)
  
  // TEMPORARILY SKIP VECTOR SEARCH - Use text search instead
  console.log('Using fallback text search...')
  const results = await fallbackTextSearch(userId, query, limit)
  console.log('Results found:', results.length)
  
  return results
}

// Fallback text search if vector search fails
async function fallbackTextSearch(userId: string, query: string, limit: number) {
  console.log('Fallback search - User ID:', userId)
  
  // First, let's just get ALL emails for this user to test
  const { data: allEmails, error: allError } = await supabase
    .from('emails')
    .select('*')
    .eq('user_id', userId)
  
  console.log('Total emails for user:', allEmails?.length || 0)
  
  if (allError) {
    console.error('Error fetching all emails:', allError)
  }
  
  // Now try text search
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
  
  // If text search found nothing, just return all emails
  if (!data || data.length === 0) {
    console.log('No text matches, returning all emails')
    return allEmails?.slice(0, limit) || []
  }
  
  return data || []
}