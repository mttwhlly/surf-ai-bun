import { serve } from "bun"
import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

// MINIMAL SCHEMA - Should never fail
const surfReportSchema = z.object({
  report: z.string().min(30).describe("Surf report"),
  boardRecommendation: z.string().min(3).describe("Board type"),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced']).describe("Skill level"),
  bestSpots: z.array(z.string()).optional().describe("Best spots"),
  timingAdvice: z.string().optional().describe("Timing advice")
})

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400'
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  })
}

function corsResponse() {
  return new Response(null, { status: 204, headers: corsHeaders })
}

// SIMPLE PROMPT FUNCTION
function createSimplePrompt(surfData: any): string {
  const windMph = Math.round(surfData.details.wind_speed_kts * 1.15078)
  
  return `Write a surf report for St. Augustine, FL:

Current conditions:
- Waves: ${surfData.details.wave_height_ft} feet
- Wind: ${windMph} mph 
- Tide: ${surfData.details.tide_state}
- Water: ${surfData.weather.water_temperature_f}°F

Write 2 paragraphs about the surf conditions and what board to use. Keep it friendly and conversational.`
}

// SIMPLE REPORT GENERATION
async function generateSurfReport(surfData: any) {
  console.log('🤖 Generating surf report...')
  
  try {
    const prompt = createSimplePrompt(surfData)
    
    const { object: aiResponse } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: surfReportSchema,
      prompt,
      temperature: 0.4,
      maxTokens: 400,
    })
    
    console.log(`✅ AI generated ${aiResponse.report.length} char report`)
    
    // Create report object
    const report = {
      id: `surf_simple_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
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
        best_spots: aiResponse.bestSpots || ['Vilano Beach', 'St. Augustine Pier'],
        timing_advice: aiResponse.timingAdvice || 'Check conditions regularly'
      },
      cached_until: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      generation_meta: {
        backend: 'bun-simple',
        model: 'gpt-4o-mini',
        report_length: aiResponse.report.length
      }
    }
    
    return report
    
  } catch (error) {
    console.error('❌ AI generation failed:', error)
    
    // HARDCODED FALLBACK
    const windMph = Math.round(surfData.details.wind_speed_kts * 1.15078)
    const fallbackReport = `Surf check for St. Augustine! We've got ${surfData.details.wave_height_ft} foot waves rolling in with ${windMph} mph winds. The tide is ${surfData.details.tide_state.toLowerCase()} which is creating ${surfData.score >= 60 ? 'decent' : 'mellow'} conditions. Water temp is ${surfData.weather.water_temperature_f}°F so you'll want to grab your ${surfData.details.wave_height_ft >= 3 ? 'shortboard' : 'longboard'} and hit up Vilano Beach or the pier for some fun waves!`
    
    return {
      id: `surf_fallback_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      location: surfData.location,
      report: fallbackReport,
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
        board_type: surfData.details.wave_height_ft >= 3 ? 'Shortboard' : 'Longboard',
        skill_level: surfData.score >= 65 ? 'intermediate' : 'beginner',
        best_spots: ['Vilano Beach', 'St. Augustine Pier'],
        timing_advice: 'Check conditions regularly'
      },
      cached_until: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      generation_meta: {
        backend: 'bun-simple',
        model: 'hardcoded-fallback',
        report_length: fallbackReport.length
      }
    }
  }
}

// MAIN REQUEST HANDLER
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const method = req.method
  
  console.log(`${method} ${url.pathname}`)
  
  if (method === 'OPTIONS') return corsResponse()
  
  // HEALTH CHECK
  if (method === 'GET' && url.pathname === '/health') {
    return jsonResponse({
      status: 'ok',
      service: 'Surf Lab AI (Simple Bun)',
      timestamp: new Date().toISOString(),
      runtime: 'Bun',
      version: Bun.version
    })
  }
  
  // AI GENERATION
  if (method === 'POST' && url.pathname === '/generate-surf-report') {
    try {
      const body = await req.json()
      const { surfData, apiKey } = body
      
      if (apiKey !== process.env.API_SECRET) {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }
      
      if (!surfData) {
        return jsonResponse({ error: 'Missing surf data' }, 400)
      }
      
      const report = await generateSurfReport(surfData)
      
      return jsonResponse({
        success: true,
        report,
        performance: {
          backend: 'bun-simple',
          runtime: 'bun'
        }
      })
      
    } catch (error) {
      console.error('❌ Generate endpoint failed:', error)
      return jsonResponse({
        success: false,
        error: 'Generation failed',
        details: error instanceof Error ? error.message : String(error)
      }, 500)
    }
  }
  
  // CRON GENERATION
  if (method === 'POST' && url.pathname === '/cron/generate-fresh-report') {
    try {
      const body = await req.json()
      const { cronSecret, vercelUrl } = body
      
      if (cronSecret !== process.env.CRON_SECRET) {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }
      
      console.log('🌊 Fetching surf data...')
      const surfDataResponse = await fetch(`${vercelUrl}/api/surfability`)
      
      if (!surfDataResponse.ok) {
        throw new Error(`Surf data failed: ${surfDataResponse.status}`)
      }
      
      const surfData = await surfDataResponse.json()
      console.log('📊 Got surf data:', surfData.location)
      
      // Generate report using the simple function
      const report = await generateSurfReport(surfData)
      
      console.log(`✅ Report generated: ${report.id}`)
      
      // Save to Vercel
      try {
        const saveResponse = await fetch(`${vercelUrl}/api/admin/save-report`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${cronSecret}`
          },
          body: JSON.stringify({ report })
        })
        
        if (saveResponse.ok) {
          console.log('✅ Report saved successfully')
        } else {
          console.warn('⚠️ Save failed but continuing:', saveResponse.status)
        }
        
      } catch (saveError) {
        console.warn('⚠️ Save error but continuing:', saveError)
      }
      
      return jsonResponse({
        success: true,
        timestamp: new Date().toISOString(),
        backend: 'bun-simple',
        actions: {
          surf_data_fetched: true,
          ai_report_generated: true,
          new_report_id: report.id,
          report_quality: {
            length: report.generation_meta.report_length,
            backend: report.generation_meta.backend
          }
        }
      })
      
    } catch (error) {
      console.error('❌ Cron endpoint failed:', error)
      return jsonResponse({
        success: false,
        error: 'Cron failed',
        details: error instanceof Error ? error.message : String(error)
      }, 500)
    }
  }
  
  return jsonResponse({ error: 'Not found' }, 404)
}

// START SERVER
const port = parseInt(process.env.PORT || '3000')

console.log(`🚀 Simple Bun Surf Lab starting on port ${port}`)
console.log(`⚡ Runtime: Bun ${Bun.version}`)

serve({
  port,
  async fetch(req) {
    try {
      return await handleRequest(req)
    } catch (error) {
      console.error('🚨 Request failed:', error)
      return jsonResponse({
        error: 'Internal error',
        details: error instanceof Error ? error.message : String(error)
      }, 500)
    }
  }
})

console.log(`✅ Simple Bun server running at http://localhost:${port}`)