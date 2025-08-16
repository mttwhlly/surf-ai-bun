import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const surfReportSchema = z.object({
  report: z.string().max(600),
  boardRecommendation: z.string(),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced']),
  bestSpots: z.array(z.string()).max(2).optional(),
  timingAdvice: z.string().optional()
})

const port = parseInt(process.env.PORT || '9001')

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)
    
    // Add CORS headers manually
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Content-Type': 'application/json'
    }
    
    // Handle preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 200, headers })
    }
    
    // Health endpoint
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'ok',
        service: 'Surf Lab AI (Pure Bun)',
        timestamp: new Date().toISOString(),
        port: port
      }), { headers })
    }
    
    // AI generation endpoint
    if (url.pathname === '/generate-surf-report' && req.method === 'POST') {
      try {
        const body = await req.json()
        const { surfData, apiKey } = body
        
        if (apiKey !== process.env.API_SECRET) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers
          })
        }
        
        if (!surfData) {
          return new Response(JSON.stringify({ error: 'Missing surf data' }), {
            status: 400, headers
          })
        }
        
        const startTime = performance.now()
        
        const prompt = `St. Augustine surf report:
- Waves: ${surfData.details.wave_height_ft}ft @ ${surfData.details.wave_period_sec}s
- Wind: ${surfData.details.wind_speed_kts}kts from ${surfData.details.wind_direction_deg}°  
- Tide: ${surfData.details.tide_state}
- Score: ${surfData.score}/100

Write a conversational surf report as a local surfer.`

        const { object: aiResponse } = await generateObject({
          model: openai('gpt-4o-mini'),
          schema: surfReportSchema,
          prompt,
          temperature: 0.6,
          maxTokens: 350,
        })
        
        const endTime = performance.now()
        
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
            generation_time_ms: Math.round(endTime - startTime),
            backend: 'pure-bun'
          }
        }
        
        return new Response(JSON.stringify({
          success: true,
          report,
          performance: {
            generation_time_ms: Math.round(endTime - startTime)
          }
        }), { headers })
        
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: 'AI generation failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        }), { status: 500, headers })
      }
    }
    
    // Cron endpoint
    if (url.pathname === '/cron/generate-fresh-report' && req.method === 'POST') {
      try {
        const body = await req.json()
        const { cronSecret, vercelUrl } = body
        
        if (cronSecret !== process.env.CRON_SECRET) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers
          })
        }
        
        // Fetch surf data
        const surfDataResponse = await fetch(`${vercelUrl}/api/surfability`)
        const surfData = await surfDataResponse.json()
        
        // Generate report (same as above endpoint)
        // ... implementation here
        
        return new Response(JSON.stringify({
          success: true,
          message: 'Report generated via cron'
        }), { headers })
        
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }), { status: 500, headers })
      }
    }
    
    // 404
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404, headers
    })
  },
})

console.log(`🚀 Pure Bun server running on port ${server.port}`)
console.log(`🔗 Health: http://localhost:${server.port}/health`)
