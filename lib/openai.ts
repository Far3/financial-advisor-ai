import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000)
    })
    
    return response.data[0].embedding
  } catch (error) {
    console.error('Error generating embedding:', error)
    throw error
  }
}

export async function chatCompletion(messages: Array<{role: string, content: string}>) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: messages as any,
      temperature: 0.7,
      max_tokens: 500
    })
    
    return response.choices[0].message.content
  } catch (error) {
    console.error('Error with chat completion:', error)
    throw error
  }
}

// Function calling version
export async function chatCompletionWithTools(
  messages: Array<{role: string, content: string}>,
  tools: any[]
) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: messages as any,
      tools,
      tool_choice: 'auto',
      temperature: 0.7,
      max_tokens: 500
    })
    
    return response.choices[0]
  } catch (error) {
    console.error('Error with function calling:', error)
    throw error
  }
}