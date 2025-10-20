'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface MarketData {
  price: number
  change: number
  changePercent: number
  high: number
  low: number
  open: number
  previousClose: number
}

export default function MarketWidget() {
  const [marketData, setMarketData] = useState<MarketData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchMarketData = async () => {
  try {
    const API_KEY = process.env.NEXT_PUBLIC_TWELVE_DATA_KEY || 'demo'
    
    const response = await fetch(
      `https://api.twelvedata.com/quote?symbol=SPY&apikey=${API_KEY}`
    )
    
    const data = await response.json()
    
    if (data.price) {
      setMarketData({
        price: parseFloat(data.price),
        change: parseFloat(data.change),
        changePercent: parseFloat(data.percent_change),
        high: parseFloat(data.high),
        low: parseFloat(data.low),
        open: parseFloat(data.open),
        previousClose: parseFloat(data.previous_close)
      })
    }
    
    setError(null)
  } catch (err) {
    setError('Failed to fetch market data')
    console.error('Market data error:', err)
  } finally {
    setLoading(false)
  }
    try {
      // Using Alpha Vantage free API
      // Get your free API key from: https://www.alphavantage.co/support/#api-key
      const API_KEY = process.env.NEXT_PUBLIC_ALPHA_VANTAGE_KEY || 'demo'
      
      const response = await fetch(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=SPY&apikey=${API_KEY}`
      )
      
      const data = await response.json()
      
      if (data['Global Quote']) {
        const quote = data['Global Quote']
        setMarketData({
          price: parseFloat(quote['05. price']),
          change: parseFloat(quote['09. change']),
          changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
          high: parseFloat(quote['03. high']),
          low: parseFloat(quote['04. low']),
          open: parseFloat(quote['02. open']),
          previousClose: parseFloat(quote['08. previous close'])
        })
      }
      
      setError(null)
    } catch (err) {
      setError('Failed to fetch market data')
      console.error('Market data error:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMarketData()
    
    // Update every 60 seconds (Alpha Vantage has rate limits)
    const interval = setInterval(fetchMarketData, 60000)
    
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="bg-[#1A1F2E] border border-[#252B3B] rounded-xl p-4 animate-pulse">
        <div className="h-4 bg-[#252B3B] rounded w-24 mb-2"></div>
        <div className="h-8 bg-[#252B3B] rounded w-32"></div>
      </div>
    )
  }

  if (error || !marketData) {
    return (
      <div className="bg-[#1A1F2E] border border-[#252B3B] rounded-xl p-4">
        <p className="text-gray-500 text-sm">Market data unavailable</p>
      </div>
    )
  }

  const isPositive = marketData.change >= 0
  const isNegative = marketData.change < 0

  return (
    <div className="bg-[#1A1F2E] border border-[#252B3B] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-gray-400 text-xs font-medium">S&P 500 (SPY)</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-white text-2xl font-bold">
              ${marketData.price.toFixed(2)}
            </span>
          </div>
        </div>
        
        {isPositive && (
          <TrendingUp className="w-6 h-6 text-green-500" />
        )}
        {isNegative && (
          <TrendingDown className="w-6 h-6 text-red-500" />
        )}
        {!isPositive && !isNegative && (
          <Minus className="w-6 h-6 text-gray-500" />
        )}
      </div>

      <div className="flex items-center gap-2 mb-3">
        <span
          className={`text-sm font-semibold ${
            isPositive ? 'text-green-500' : isNegative ? 'text-red-500' : 'text-gray-500'
          }`}
        >
          {isPositive ? '+' : ''}{marketData.change.toFixed(2)}
        </span>
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            isPositive
              ? 'bg-green-500/10 text-green-500'
              : isNegative
              ? 'bg-red-500/10 text-red-500'
              : 'bg-gray-500/10 text-gray-500'
          }`}
        >
          {isPositive ? '+' : ''}{marketData.changePercent.toFixed(2)}%
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#252B3B]">
        <div>
          <p className="text-gray-500 text-xs">Open</p>
          <p className="text-gray-300 text-sm font-medium">${marketData.open.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Prev Close</p>
          <p className="text-gray-300 text-sm font-medium">${marketData.previousClose.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">High</p>
          <p className="text-gray-300 text-sm font-medium">${marketData.high.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Low</p>
          <p className="text-gray-300 text-sm font-medium">${marketData.low.toFixed(2)}</p>
        </div>
      </div>

      <p className="text-gray-600 text-xs mt-3 text-center">
        Updates every minute
      </p>
    </div>
  )
}