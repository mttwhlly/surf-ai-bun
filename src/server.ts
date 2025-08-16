import { serve } from "bun"
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const app = new Hono()

app.use('*', cors({
  origin: ['https://surf-report-rouge.vercel.app', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))

const surfReportSchema = z.object({
  report: z.string().max(600).describe("Concise surf report in local voice"),
  boardRecommendation: z.string().describe("Board type"),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced']),
  bestSpots: z.array(z.string()).max(2).optional().describe("Top 2 spots"),
  timingAdvice: z.string().optional().describe("Timing tip")
})

app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'Surf Lab AI (Bun+Hono)',
    timestamp: new Date().toISOString(),
    runtime: 'Bun', 
    framework: 'Hono',
    performance: 'maximum'
  })
})

app.post('/generate-surf-report', async (c) => {
  const startTime = Bun.nanoseconds()
  
  try {
    console.log('🤖 AI generation request (Bun+Hono)')
    
    const { surfData, apiKey } = await c.req.json()
    
    if (apiKey !== process.env.API_SECRET) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    
    if (!surfData) {
      return c.json({ error: 'Missing surf data' }, 400)
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
        backend: 'bun-hono-ultra',
        model: 'gpt-4o-mini'
      }
    }
    
    const totalTime = (Bun.nanoseconds() - startTime) / 1_000_000
    console.log(`⚡ Bun+Hono AI: ${Math.round(aiTime)}ms total: ${Math.round(totalTime)}ms`)
    
    return c.json({
      success: true,
      report,
      performance: {
        ai_generation_ms: Math.round(aiTime),
        total_time_ms: Math.round(totalTime),
        runtime: 'bun'
      }
    })
    
  } catch (error) {
    const errorTime = (Bun.nanoseconds() - startTime) / 1_000_000
    console.error('❌ Bun+Hono generation failed:', error)
    
    return c.json({
      success: false,
      error: 'AI generation failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: Math.round(errorTime)
    }, 500)
  }
})

app.post('/cron/generate-fresh-report', async (c) => {
  const startTime = Bun.nanoseconds()
  
  try {
    console.log('🕐 Bun+Hono cron generation started')
    
    const { cronSecret, vercelUrl } = await c.req.json()
    
    if (cronSecret !== process.env.CRON_SECRET) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    
    console.log('🌊 Fetching surf data...')
    const surfDataResponse = await fetch(`${vercelUrl}/api/surfability`, {
      headers: { 'User-Agent': 'Bun-Hono-Ultra/1.0' },
      signal: AbortSignal.timeout(10000)
    })
    
    if (!surfDataResponse.ok) {
      throw new Error(`Surf data failed: ${surfDataResponse.status}`)
    }
    
    const surfData = await surfDataResponse.json()
    console.log('📊 Got surf data:', surfData.location)
    
    // FIXED: Generate AI report directly instead of calling ourselves
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
        backend: 'bun-hono-ultra',
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
    
    return c.json({
      success: true,
      timestamp: new Date().toISOString(),
      backend: 'bun-hono-ultra',
      performance: {
        total_time_ms: Math.round(totalTime),
        ai_generation_ms: Math.round(aiTime),
        runtime: 'bun',
        framework: 'hono'
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
    console.error('❌ Bun cron failed:', error)
    
    return c.json({
      success: false,
      error: 'Bun cron failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      duration_ms: Math.round(errorTime)
    }, 500)
  }
})

app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404)
})

app.onError((err, c) => {
  console.error('🚨 Bun+Hono error:', err)
  return c.json({
    error: 'Internal server error',
    details: err.message
  }, 500)
})

const port = parseInt(process.env.PORT || '3001')

console.log(`🚀 Bun+Hono Surf Lab starting on port ${port}`)
console.log(`⚡ Runtime: Bun ${Bun.version}`)
console.log(`🔗 Health: http://localhost:${port}/health`)

export default serve({
  fetch: app.fetch,
  port,
  development: process.env.NODE_ENV === 'development',
})

console.log(`✅ Server running at http://localhost:${port}`)
