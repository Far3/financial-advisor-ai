'use client'

import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import MarketWidget from './components/MarketWidget'
import { Loader2, RefreshCw, Send } from 'lucide-react'


function ChatInterface() {
  const searchParams = useSearchParams()
  const userId = searchParams.get('user')
  const [messages, setMessages] = useState<Array<{ role: string, content: string }>>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  const syncGmail = async () => {
    setSyncing(true)
    setSyncMessage('Syncing emails...')

    try {
      const response = await fetch('/api/sync/gmail', { method: 'POST' })
      const data = await response.json()

      if (data.success) {
        setSyncMessage(data.message)
        setTimeout(() => setSyncMessage(''), 3000)
      } else {
        setSyncMessage(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Sync error:', error)
      setSyncMessage('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const syncHubSpot = async () => {
    setSyncing(true)
    setSyncMessage('Syncing HubSpot contacts...')

    try {
      const response = await fetch('/api/sync/hubspot', { method: 'POST' })
      const data = await response.json()

      if (data.success) {
        setSyncMessage(data.message)
        setTimeout(() => setSyncMessage(''), 3000)
      } else {
        setSyncMessage(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('HubSpot sync error:', error)
      setSyncMessage('HubSpot sync failed')
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
      console.error('Message error:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.'
      }])
    } finally {
      setLoading(false)
    }
  }

  if (!userId) {
    return (
      <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center p-4">
        <div className="bg-[#1A1F2E] p-10 rounded-3xl shadow-2xl max-w-md w-full border border-[#252B3B]">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🤖</div>
            <h1 className="text-3xl font-bold text-white mb-3">AI Assistant</h1>
            <p className="text-gray-400 text-sm">
              Connect your accounts to get started
            </p>
          </div>
          <a
            href="/api/auth/google/login"
            className="block w-full bg-blue-600 text-white py-4 px-6 rounded-xl hover:bg-blue-700 transition text-center font-semibold shadow-lg hover:shadow-xl"
          >
            Login with Google
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-[#0B0F19]">
      {/* Sidebar */}
      <div className="w-72 bg-[#12161F] border-r border-[#1E2330] flex flex-col">
        <div className="p-6 border-b border-[#1E2330]">
          <h1 className="text-2xl font-bold text-white">AI Assistant</h1>
          <p className="text-sm text-gray-500 mt-1">Financial Advisor</p>
        </div>
        
        <div className="flex-1 p-4 space-y-1">
            <MarketWidget />
          <div className="pt-4 mt-4 border-t border-[#1E2330] space-y-1">
            <button
              onClick={syncGmail}
              disabled={syncing}
              className="w-full text-left px-4 py-3 rounded-lg text-gray-400 hover:bg-[#1A1F2E] transition-colors flex items-center gap-3 disabled:opacity-50 text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span>Sync Gmail</span>
            </button>
            <button
              onClick={syncHubSpot}
              disabled={syncing}
              className="w-full text-left px-4 py-3 rounded-lg text-gray-400 hover:bg-[#1A1F2E] transition-colors flex items-center gap-3 disabled:opacity-50 text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              <span>Sync HubSpot</span>
            </button>
          </div>
        </div>

        <div className="p-6 border-t border-[#1E2330]">
          <div className="text-xs text-gray-500 space-y-3">
            <div>
              <div className="text-gray-400 font-medium mb-2">Connected Services</div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span className="text-gray-400">Gmail</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  <span className="text-gray-400">Calendar</span>
                </div>
                {searchParams.get('hubspot') === 'connected' ? (
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    <span className="text-gray-400">HubSpot</span>
                  </div>
                ) : (
                  <a
                    href="/api/auth/hubspot/login"
                    className="flex items-center gap-2 text-orange-400 hover:text-orange-300"
                  >
                    <span className="w-2 h-2 bg-orange-500 rounded-full"></span>
                    <span>Connect HubSpot</span>
                  </a>
                )}
              </div>
            </div>
            <div className="pt-3 border-t border-[#1E2330] text-gray-600">
              User: {userId.slice(0, 8)}...
            </div>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-20 border-b border-[#1E2330] flex items-center px-8 bg-[#12161F]">
          <h2 className="text-xl font-semibold text-white">Chat</h2>
        </div>

        {/* Sync Message */}
        {syncMessage && (
          <div className="mx-8 mt-4 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
            <p className="text-sm text-blue-300">{syncMessage}</p>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-8 py-8">
          {messages.length === 0 ? (
            <div className="max-w-3xl mx-auto text-center mt-32">
              <div className="text-7xl mb-6">💬</div>
              <h3 className="text-2xl font-semibold text-white mb-3">How can I help you today?</h3>
              <p className="text-gray-400 mb-8">Ask me anything about your emails, calendar, or contacts</p>
              <div className="grid gap-3 text-left max-w-2xl mx-auto">
                <div className="bg-[#1A1F2E] border border-[#252B3B] rounded-xl p-4 hover:border-[#2A3142] transition-colors cursor-pointer">
                  <p className="text-gray-300 text-sm">What's on my calendar this week?</p>
                </div>
                <div className="bg-[#1A1F2E] border border-[#252B3B] rounded-xl p-4 hover:border-[#2A3142] transition-colors cursor-pointer">
                  <p className="text-gray-300 text-sm">Schedule a meeting with Sara Smith</p>
                </div>
                <div className="bg-[#1A1F2E] border border-[#252B3B] rounded-xl p-4 hover:border-[#2A3142] transition-colors cursor-pointer">
                  <p className="text-gray-300 text-sm">Who mentioned baseball in their emails?</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">
              {messages.map((message, i) => (
                <div
                  key={i}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-6 py-4 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-[#1A1F2E] text-gray-100 border border-[#252B3B]'
                    }`}
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">{message.content}</div>
                  </div>
                </div>
              ))}
              
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-[#1A1F2E] border border-[#252B3B] rounded-2xl px-6 py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-[#1E2330] p-6 bg-[#12161F]">
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="max-w-4xl mx-auto">
            <div className="flex gap-3 items-end">
              <div className="flex-1 bg-[#1A1F2E] border border-[#252B3B] rounded-2xl focus-within:border-blue-500 transition-colors">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask me anything..."
                  disabled={loading}
                  className="w-full bg-transparent text-white px-6 py-4 focus:outline-none disabled:opacity-50 placeholder-gray-500"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="bg-blue-600 text-white rounded-2xl px-7 py-4 hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium shadow-lg"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>Send</span>
                    <Send className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0B0F19] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    }>
      <ChatInterface />
    </Suspense>
  )
}