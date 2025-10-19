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

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function chatCompletion(messages: ChatMessage[]) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: messages as Array<{role: 'system' | 'user' | 'assistant', content: string}>,
      temperature: 0.7,
      max_tokens: 500
    })
    
    return response.choices[0].message.content
  } catch (error) {
    console.error('Error with chat completion:', error)
    throw error
  }
}

type Tool = {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

// Function calling version
export async function chatCompletionWithTools(
  messages: ChatMessage[],
  tools: Tool[]
) {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: messages as Array<{ role: 'system' | 'user' | 'assistant', content: string }>,
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