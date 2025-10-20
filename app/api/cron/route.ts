import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  try {
    const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    
    console.log('=== CRON JOB START ===')
    
    // STEP 1: Sync emails first
    console.log('Step 1: Syncing emails...')
    const syncResponse = await fetch(`${baseUrl}/api/sync-emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    const syncData = await syncResponse.json()
    console.log('Email sync result:', syncData)
    
    // STEP 2: Monitor for task responses
    console.log('Step 2: Monitoring for responses...')
    const monitorResponse = await fetch(`${baseUrl}/api/monitor-emails`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    const monitorData = await monitorResponse.json()
    console.log('Monitor result:', monitorData)
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      sync: syncData,
      monitor: monitorData
    })
  } catch (error) {
    console.error('Cron error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Cron failed'
    }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return GET(request)
}