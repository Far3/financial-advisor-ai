import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  // Verify auth token
  const authHeader = request.headers.get('authorization')
  
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    // Get the base URL
    const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    
    // Call the monitor endpoint
    const response = await fetch(`${baseUrl}/api/monitor-emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    const data = await response.json()
    
    console.log('Cron job completed:', data)
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...data
    })
  } catch (error) {
    console.error('Cron error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Cron failed'
    }, { status: 500 })
  }
}

// Also support POST for flexibility
export async function POST(request: Request) {
  return GET(request)
}