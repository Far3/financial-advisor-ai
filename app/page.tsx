'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function Home() {
  const searchParams = useSearchParams()
  const userId = searchParams.get('user')
  const [messages, setMessages] = useState<Array<{ role: string, content: string }>>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  if (!userId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
          <h1 className="text-2xl font-bold mb-4 text-center">Financial Advisor AI</h1>
          <p className="text-gray-600 mb-6 text-center">
            Connect your Gmail and HubSpot to get started
          </p>
          <a
            href="/api/auth/google/login"
            className="block w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition text-center font-medium"
          >
            Login with Google
          </a>
        </div>
      </div>
    )
  }

  const syncGmail = async () => {
    setSyncing(true)
    setSyncMessage('Syncing emails...')

    try {
      const response = await fetch('/api/sync/gmail', { method: 'POST' })
      const data = await response.json()

      if (data.success) {
        setSyncMessage(data.message)
      } else {
        setSyncMessage(`Error: ${data.error}`)
      }
    } catch (error) {
      setSyncMessage('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

const sendMessage = async () => {
  if (!input.trim() || loading) return
  
  const userMessage = { role: 'user', content: input }
  setMessages(prev => [...prev, userMessage])
  setInput('')
  setLoading(true)
  
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: input,
        conversationHistory: messages
      })
    })
    
    const data = await response.json()
    
    if (data.success) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response + (data.emailsFound > 0 ? `\n\n_(Found ${data.emailsFound} relevant emails)_` : '')
      }])
    } else {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${data.error}`
      }])
    }
  } catch (error) {
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: 'Sorry, something went wrong. Please try again.'
    }])
  } finally {
    setLoading(false)
  }
}

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Financial Advisor AI Assistant</h1>
            <p className="text-sm text-gray-600">Logged in • User ID: {userId.slice(0, 8)}...</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={syncGmail}
              disabled={syncing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition text-sm"
            >
              {syncing ? 'Syncing...' : 'Sync Gmail'}
            </button>

            {searchParams.get('hubspot') === 'connected' ? (
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
                ✓ HubSpot Connected
              </span>
            ) : (
              <a
                href="/api/auth/hubspot/login"
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition text-sm"
              >
                Connect HubSpot
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Sync Message */}
      {syncMessage && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 m-4">
          <p className="text-sm text-blue-800">{syncMessage}</p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-8">
            <p>Ask me anything about your clients!</p>
            <p className="text-sm mt-2">Try: "Who mentioned their kid plays baseball?"</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[70%] rounded-lg px-4 py-2 ${msg.role === 'user'
              ? 'bg-blue-600 text-white'
              : 'bg-white border shadow-sm'
              }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border shadow-sm rounded-lg px-4 py-2">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="bg-white border-t p-4">
        <div className="max-w-4xl mx-auto flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Ask me anything..."
            className="flex-1 border rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={sendMessage}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}