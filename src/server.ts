import { serve } from "bun"
import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const surfReportSchema = z.object({
  report: z.string().max(600).describe("Concise surf report in local voice"),
  boardRecommendation: z.string().describe("Board type"),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced']),
  bestSpots: z.array(z.string()).max(2).optional().describe("Top 2 spots"),
  timingAdvice: z.string().optional().describe("Timing tip")
})

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
}

// Helper to create JSON response with CORS
function jsonResponse(data: any, status = 200, additionalHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      ...additionalHeaders
    }
  })
}

// Helper to handle CORS preflight
function corsResponse() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  })
}

// Main request handler
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const method = req.method
  
  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return corsResponse()
  }
  
  // Route handlers
  if (method === 'GET' && url.pathname === '/health') {
    return handleHealth()
  }
  
  if (method === 'POST' && url.pathname === '/generate-surf-report') {
    return handleGenerateSurfReport(req)
  }
  
  if (method === 'POST' && url.pathname === '/cron/generate-fresh-report') {
    return handleCronGeneration(req)
  }
  
  // 404 handler
  return jsonResponse({ error: 'Not found' }, 404)
}

function handleHealth(): Response {
  return jsonResponse({
    status: 'ok',
    service: 'Surf Lab AI (Pure Bun)',
    timestamp: new Date().toISOString(),
    runtime: 'Bun',
    framework: 'Native',
    performance: 'maximum',
    version: Bun.version
  })
}

async function handleGenerateSurfReport(req: Request): Promise<Response> {
  const startTime = Bun.nanoseconds()
  
  try {
    console.log('🤖 AI generation request (Pure Bun)')
    
    const body = await req.json()
    const { surfData, apiKey } = body
    
    if (apiKey !== process.env.API_SECRET) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }
    
    if (!surfData) {
      return jsonResponse({ error: 'Missing surf data' }, 400)
    }
    
    const prompt = `St. Augustine surf report:

CONDITIONS:
- Waves: ${surfData.details.wave_height_ft}ft @ ${surfData.details.wave_period_sec}s
- Wind: ${surfData.details.wind_speed_kts}kts from ${surfData.details.wind_direction_deg}°  
- Tide: ${surfData.details.tide_state} (${surfData.details.tide_height_ft}ft)
- Air: ${surfData.weather.air_temperature_f}°F | Water: ${surfData.weather.water_temperature_f}°F
- Score: ${surfData.score}/100

Write a conversational 2-3 paragraph surf report as a local surfer. Include wave quality, wind effects, tide timing, board suggestions, and best St. Augustine spots (Vilano, Pier, Anastasia). Keep it authentic Florida East Coast style.`

    const aiStart = Bun.nanoseconds()
    const { object: aiResponse } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: surfReportSchema,
      prompt,
      temperature: 0.6,
      maxTokens: 350,
    })
    
    const aiTime = (Bun.nanoseconds() - aiStart) / 1_000_000
    
    const report = {
      id: `surf_bun_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      location: surfData.location,
      report: aiResponse.report,
      conditions: {
        wave_height_ft: surfData.details.wave_height_ft,
        wave_period_sec: surfData.details.wave_period_sec,
        wind_speed_kts: surfData.details.wind_speed_kts,
        wind_direction_deg: surfData.details.wind_direction_deg,
        tide_state: surfData.details.tide_state,
        weather_description: surfData.weather.weather_description,
        surfability_score: surfData.score
      },
      recommendations: {
        board_type: aiResponse.boardRecommendation,
        skill_level: aiResponse.skillLevel,
        best_spots: aiResponse.bestSpots,
        timing_advice: aiResponse.timingAdvice
      },
      cached_until: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      generation_meta: {
        generation_time_ms: Math.round(aiTime),
        total_time_ms: Math.round((Bun.nanoseconds() - startTime) / 1_000_000),
        backend: 'pure-bun-ultra',
        model: 'gpt-4o-mini'
      }
    }
    
    const totalTime = (Bun.nanoseconds() - startTime) / 1_000_000
    console.log(`⚡ Pure Bun AI: ${Math.round(aiTime)}ms total: ${Math.round(totalTime)}ms`)
    
    return jsonResponse({
      success: true,
      report,
      performance: {
        ai_generation_ms: Math.round(aiTime),
        total_time_ms: Math.round(totalTime),
        runtime: 'pure-bun'
      }
    })
    
  } catch (error) {
    const errorTime = (Bun.nanoseconds() - startTime) / 1_000_000
    console.error('❌ Pure Bun generation failed:', error)
    
    return jsonResponse({
      success: false,
      error: 'AI generation failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: Math.round(errorTime)
    }, 500)
  }
}

async function handleCronGeneration(req: Request): Promise<Response> {
  const startTime = Bun.nanoseconds()
  
  try {
    console.log('🕐 Pure Bun cron generation started')
    
    const body = await req.json()
    const { cronSecret, vercelUrl } = body
    
    if (cronSecret !== process.env.CRON_SECRET) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }
    
    console.log('🌊 Fetching surf data...')
    const surfDataResponse = await fetch(`${vercelUrl}/api/surfability`, {
      headers: { 'User-Agent': 'Pure-Bun-Ultra/1.0' },
      signal: AbortSignal.timeout(10000)
    })
    
    if (!surfDataResponse.ok) {
      throw new Error(`Surf data failed: ${surfDataResponse.status}`)
    }
    
    const surfData = await surfDataResponse.json()
    console.log('📊 Got surf data:', surfData.location)
    
    // Generate AI report directly
    console.log('🤖 Generating AI report...')
    const aiStart = Bun.nanoseconds()
    
    const { object: aiResponse } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: surfReportSchema,
      prompt: `St. Augustine surf report:

CONDITIONS:
- Waves: ${surfData.details.wave_height_ft}ft @ ${surfData.details.wave_period_sec}s
- Wind: ${surfData.details.wind_speed_kts}kts from ${surfData.details.wind_direction_deg}°  
- Tide: ${surfData.details.tide_state} (${surfData.details.tide_height_ft}ft)
- Air: ${surfData.weather.air_temperature_f}°F | Water: ${surfData.weather.water_temperature_f}°F
- Score: ${surfData.score}/100

Write a conversational 2-3 paragraph surf report as a local surfer. Include wave quality, wind effects, tide timing, board suggestions, and best St. Augustine spots (Vilano, Pier, Anastasia). Keep it authentic Florida East Coast style.`,
      temperature: 0.6,
      maxTokens: 350,
    })
    
    const aiTime = (Bun.nanoseconds() - aiStart) / 1_000_000
    
    // Create the report object
    const report = {
      id: `surf_bun_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      location: surfData.location,
      report: aiResponse.report,
      conditions: {
        wave_height_ft: surfData.details.wave_height_ft,
        wave_period_sec: surfData.details.wave_period_sec,
        wind_speed_kts: surfData.details.wind_speed_kts,
        wind_direction_deg: surfData.details.wind_direction_deg,
        tide_state: surfData.details.tide_state,
        weather_description: surfData.weather.weather_description,
        surfability_score: surfData.score
      },
      recommendations: {
        board_type: aiResponse.boardRecommendation,
        skill_level: aiResponse.skillLevel,
        best_spots: aiResponse.bestSpots,
        timing_advice: aiResponse.timingAdvice
      },
      cached_until: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      generation_meta: {
        generation_time_ms: Math.round(aiTime),
        total_time_ms: Math.round((Bun.nanoseconds() - startTime) / 1_000_000),
        backend: 'pure-bun-ultra',
        model: 'gpt-4o-mini'
      }
    }
    
    console.log('✅ AI report generated:', report.id)
    
    // Save to Vercel (async, non-blocking)
    fetch(`${vercelUrl}/api/admin/save-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cronSecret}`
      },
      body: JSON.stringify({ report })
    }).catch(err => console.warn('⚠️ Async save failed:', err.message))
    
    const totalTime = (Bun.nanoseconds() - startTime) / 1_000_000
    
    return jsonResponse({
      success: true,
      timestamp: new Date().toISOString(),
      backend: 'pure-bun-ultra',
      performance: {
        total_time_ms: Math.round(totalTime),
        ai_generation_ms: Math.round(aiTime),
        runtime: 'pure-bun',
        framework: 'native'
      },
      actions: {
        surf_data_fetched: true,
        ai_report_generated: true,
        report_saved_async: true,
        new_report_id: report.id
      }
    })
    
  } catch (error) {
    const errorTime = (Bun.nanoseconds() - startTime) / 1_000_000
    console.error('❌ Pure Bun cron failed:', error)
    
    return jsonResponse({
      success: false,
      error: 'Pure Bun cron failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: Math.round(errorTime)
    }, 500)
  }
}

// Global error handler
function handleError(error: Error): Response {
  console.error('🚨 Pure Bun error:', error)
  return jsonResponse({
    error: 'Internal server error',
    details: error.message,
    timestamp: new Date().toISOString()
  }, 500)
}

// Server configuration
const port = parseInt(process.env.PORT || '3001')

console.log(`🚀 Pure Bun Surf Lab starting on port ${port}`)
console.log(`⚡ Runtime: Bun ${Bun.version}`)
console.log(`🔗 Health: http://localhost:${port}/health`)
console.log(`🌊 Framework: Native Bun (no dependencies)`)

// Start the server
const server = serve({
  port,
  development: process.env.NODE_ENV === 'development',
  async fetch(req) {
    try {
      return await handleRequest(req)
    } catch (error) {
      return handleError(error as Error)
    }
  },
  error(error) {
    console.error('🚨 Server error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
})

console.log(`✅ Pure Bun server running at http://localhost:${port}`)
console.log(`🏄‍♂️ Ready to generate surf reports with maximum performance!`)

export default server