import { serve } from "bun"
import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

// IMPROVED SCHEMA - More flexible constraints to prevent validation failures
const surfReportSchema = z.object({
  report: z.string()
    .min(200)  // Reduced minimum to be more flexible
    .max(1000) // Increased maximum for longer reports
    .describe("Detailed 2-3 paragraph surf report in authentic local St. Augustine surfer voice. Include wave quality assessment, wind effects, tide timing, and specific spot recommendations."),
  boardRecommendation: z.string()
    .min(5)    // Ensure we get something meaningful
    .describe("Specific board type and size recommendation (e.g., '9'2\" longboard', '6'4\" funboard', 'shortboard 6'0\"')"),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced'])
    .describe("Recommended minimum skill level for current conditions"),
  bestSpots: z.array(z.string())
    .min(1)    // At least one spot
    .max(4)    // Max 4 spots
    .optional()
    .describe("Top 2-3 specific St. Augustine surf spots for these conditions"),
  timingAdvice: z.string()
    .min(10)   // Ensure meaningful advice
    .optional()
    .describe("Specific timing advice for best surf windows or when conditions might improve")
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
  try {
    const url = new URL(req.url)
    const method = req.method
    const pathname = url.pathname
    
    console.log(`${method} ${pathname}`)
    
    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return corsResponse()
    }
    
    // Route handlers
    switch (pathname) {
      case '/health':
        if (method === 'GET') {
          return handleHealth()
        }
        break
        
      case '/generate-surf-report':
        if (method === 'POST') {
          return await handleGenerateSurfReport(req)
        }
        break
        
      case '/cron/generate-fresh-report':
        if (method === 'POST') {
          return await handleCronGeneration(req)
        }
        break
        
      default:
        return jsonResponse({ error: 'Not found', path: pathname }, 404)
    }
    
    // Method not allowed
    return jsonResponse({ 
      error: 'Method not allowed', 
      method, 
      path: pathname 
    }, 405)
    
  } catch (error) {
    console.error('🚨 Request handler error:', error)
    return jsonResponse({
      error: 'Request handling failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
}

function handleHealth(): Response {
  try {
    return jsonResponse({
      status: 'ok',
      service: 'Surf Lab AI (Pure Bun)',
      timestamp: new Date().toISOString(),
      runtime: 'Bun',
      framework: 'Native',
      performance: 'maximum',
      version: Bun.version,
      port: port,
      environment: process.env.NODE_ENV || 'production'
    })
  } catch (error) {
    console.error('Health check error:', error)
    return jsonResponse({
      status: 'error',
      error: 'Health check failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
}

// IMPROVED PROMPT GENERATION
function createDetailedPrompt(surfData: any): string {
  const { details, weather, score, location } = surfData
  
  // Get time of day for context
  const now = new Date()
  const etTime = now.toLocaleString("en-US", {timeZone: "America/New_York"})
  const hour = new Date(etTime).getHours()
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  
  // Convert knots to MPH for user-friendly display
  const windSpeedMph = Math.round(details.wind_speed_kts * 1.15078) // 1 knot = 1.15078 mph
  
  // Determine wind effect (using MPH thresholds)
  const windEffect = windSpeedMph < 6 ? 'glassy' : 
                    windSpeedMph < 12 ? 'light texture' :
                    windSpeedMph < 17 ? 'bumpy' : 'blown out'
  
  // Assess wave quality
  const waveQuality = score >= 80 ? 'firing' :
                     score >= 65 ? 'solid' :
                     score >= 45 ? 'rideable' : 'pretty mellow'

  return `You are a knowledgeable local St. Augustine surfer writing a detailed surf report for fellow surfers. Write a comprehensive 2-3 paragraph report that captures the authentic voice of someone who surfs these waters daily.

CURRENT CONDITIONS (${timeOfDay}):
• Location: ${location}
• Wave Height: ${details.wave_height_ft} feet
• Wave Period: ${details.wave_period_sec} seconds (${details.wave_period_sec >= 10 ? 'long period groundswell' : details.wave_period_sec >= 7 ? 'decent period' : 'short period wind waves'})
• Swell Direction: ${details.swell_direction_deg}° (${getSwellDirection(details.swell_direction_deg)})
• Wind: ${windSpeedMph} mph from ${details.wind_direction_deg}° (${getWindDirection(details.wind_direction_deg)} - ${windEffect})
• Tide: ${details.tide_state} at ${details.tide_height_ft} feet
• Air Temperature: ${weather.air_temperature_f}°F
• Water Temperature: ${weather.water_temperature_f}°F  
• Weather: ${weather.weather_description}
• Overall Score: ${score}/100 (${waveQuality})

WRITING REQUIREMENTS:
1. FIRST PARAGRAPH: Open with an authentic greeting and overall assessment. Describe the wave quality, size, and shape. Mention how the ${details.wave_period_sec}-second period is affecting the waves. Discuss what the ${details.swell_direction_deg}° swell direction means for different spots around St. Augustine.

2. SECOND PARAGRAPH: Detail the wind conditions (${windSpeedMph} mph from ${details.wind_direction_deg}°) and how they're affecting the water surface. Explain the tide situation (${details.tide_state} at ${details.tide_height_ft}ft) and how it's impacting wave quality and accessibility. Mention water temperature (${weather.water_temperature_f}°F) and any wetsuit considerations.

3. THIRD PARAGRAPH: Give specific recommendations for the best spots around St. Augustine (Vilano Beach, St. Augustine Pier, Anastasia State Park, etc.) based on current conditions. Suggest appropriate board choice and skill level. Include timing advice if conditions are expected to change.

VOICE & STYLE:
- Write like a stoked local who knows every break
- Use authentic surf terminology but keep it accessible  
- Be honest about conditions - don't oversell poor waves
- Include specific local knowledge about how wind/tide affects different spots
- Maintain enthusiasm even for smaller days
- Use natural conversational flow, not stilted or overly technical
- IMPORTANT: Always use mph for wind speeds, never knots - this is more familiar to everyday users

Make this feel like a report from someone who just checked the waves and is genuinely sharing what they saw with fellow surfers.`
}

function getSwellDirection(degrees: number): string {
  if (degrees >= 315 || degrees < 45) return 'North'
  if (degrees >= 45 && degrees < 135) return 'East'  
  if (degrees >= 135 && degrees < 225) return 'South'
  return 'West'
}

function getWindDirection(degrees: number): string {
  if (degrees >= 315 || degrees < 45) return 'North'
  if (degrees >= 45 && degrees < 135) return 'East'
  if (degrees >= 135 && degrees < 225) return 'South'  
  return 'West'
}

async function handleGenerateSurfReport(req: Request): Promise<Response> {
  const startTime = Bun.nanoseconds()
  
  try {
    console.log('🤖 AI generation request (Pure Bun)')
    
    let body
    try {
      body = await req.json()
    } catch (jsonError) {
      console.error('JSON parsing error:', jsonError)
      return jsonResponse({ error: 'Invalid JSON' }, 400)
    }
    
    const { surfData, apiKey } = body
    
    if (apiKey !== process.env.API_SECRET) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }
    
    if (!surfData) {
      return jsonResponse({ error: 'Missing surf data' }, 400)
    }

    // IMPROVED: Use detailed prompt
    const prompt = createDetailedPrompt(surfData)

    const aiStart = Bun.nanoseconds()
    
    try {
      const { object: aiResponse } = await generateObject({
        model: openai('gpt-4o-mini'),
        schema: surfReportSchema,
        prompt,
        temperature: 0.6,  // Reduced from 0.7 for more consistent responses
        maxTokens: 700,    // Increased token limit
      })
      
      const aiTime = (Bun.nanoseconds() - aiStart) / 1_000_000
      
      // Validate response before proceeding
      if (!aiResponse.report || aiResponse.report.length < 150) {
        throw new Error(`Generated report too short: ${aiResponse.report?.length || 0} characters`)
      }
      
      if (!aiResponse.boardRecommendation) {
        throw new Error('Missing board recommendation')
      }
      
      console.log(`✅ AI validation passed: ${aiResponse.report.length} chars, board: ${aiResponse.boardRecommendation}`)
      
    } catch (aiError) {
      console.error('❌ AI generation or validation failed:', aiError)
      
      // Fallback: Try with simpler prompt and more relaxed parameters
      console.log('🔄 Attempting fallback generation...')
      
      const fallbackPrompt = `Write a 2-3 paragraph surf report for St. Augustine, FL with these conditions:
      
Waves: ${surfData.details.wave_height_ft}ft at ${surfData.details.wave_period_sec}s period
Wind: ${Math.round(surfData.details.wind_speed_kts * 1.15078)} mph from ${getWindDirection(surfData.details.wind_direction_deg)}
Tide: ${surfData.details.tide_state} at ${surfData.details.tide_height_ft}ft
Water: ${surfData.weather.water_temperature_f}°F
Score: ${surfData.score}/100

Write in a friendly, local surfer voice. Include wave assessment, wind effects, and board/spot recommendations.`

      const { object: fallbackResponse } = await generateObject({
        model: openai('gpt-4o-mini'),
        schema: surfReportSchema,
        prompt: fallbackPrompt,
        temperature: 0.4,  // Lower temperature for more reliable output
        maxTokens: 500,
      })
      
      const aiTime = (Bun.nanoseconds() - aiStart) / 1_000_000
      const aiResponse = fallbackResponse
      
      console.log(`🔄 Fallback generation successful: ${aiResponse.report.length} chars`)
    }
    
    // Validate report length
    if (aiResponse.report.length < 250) {
      console.warn(`⚠️ Short report generated: ${aiResponse.report.length} characters`)
    }
    
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
        backend: 'pure-bun-ultra-v2',
        model: 'gpt-4o-mini',
        report_length: aiResponse.report.length,
        prompt_tokens: Math.ceil(prompt.length / 4) // Rough estimate
      }
    }
    
    const totalTime = (Bun.nanoseconds() - startTime) / 1_000_000
    console.log(`⚡ Pure Bun AI: ${Math.round(aiTime)}ms total: ${Math.round(totalTime)}ms (${aiResponse.report.length} chars)`)
    
    return jsonResponse({
      success: true,
      report,
      performance: {
        ai_generation_ms: Math.round(aiTime),
        total_time_ms: Math.round(totalTime),
        runtime: 'pure-bun',
        report_quality: {
          length: aiResponse.report.length,
          meets_minimum: aiResponse.report.length >= 250,
          target_range: '300-800 characters'
        }
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
    
    let body
    try {
      body = await req.json()
    } catch (jsonError) {
      console.error('JSON parsing error:', jsonError)
      return jsonResponse({ error: 'Invalid JSON' }, 400)
    }
    
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
    
    // Generate AI report with improved prompt and fallback
    console.log('🤖 Generating detailed AI report...')
    const aiStart = Bun.nanoseconds()
    
    const prompt = createDetailedPrompt(surfData)
    
    try {
      const { object: aiResponse } = await generateObject({
        model: openai('gpt-4o-mini'),
        schema: surfReportSchema,
        prompt,
        temperature: 0.6,
        maxTokens: 700,
      })
      
      const aiTime = (Bun.nanoseconds() - aiStart) / 1_000_000
      
      // Validate response
      if (!aiResponse.report || aiResponse.report.length < 150) {
        throw new Error(`Generated report too short: ${aiResponse.report?.length || 0} characters`)
      }
      
      console.log(`✅ AI generation successful: ${aiResponse.report.length} chars`)
      
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
          best_spots: aiResponse.bestSpots || ['Vilano Beach', 'St. Augustine Pier'],
          timing_advice: aiResponse.timingAdvice || 'Check conditions throughout the day'
        },
        cached_until: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        generation_meta: {
          generation_time_ms: Math.round(aiTime),
          total_time_ms: Math.round((Bun.nanoseconds() - startTime) / 1_000_000),
          backend: 'pure-bun-ultra-v2',
          model: 'gpt-4o-mini',
          report_length: aiResponse.report.length,
          generation_method: 'primary'
        }
      }
      
      console.log(`✅ AI report generated: ${report.id} (${aiResponse.report.length} chars)`)
      
    } catch (aiError) {
      console.error('❌ Primary AI generation failed:', aiError)
      console.log('🔄 Attempting fallback generation...')
      
      // Fallback with simpler prompt
      const fallbackPrompt = `Write a surf report for St. Augustine, FL:
      
Waves: ${surfData.details.wave_height_ft}ft, ${surfData.details.wave_period_sec}s period
Wind: ${Math.round(surfData.details.wind_speed_kts * 1.15078)} mph ${getWindDirection(surfData.details.wind_direction_deg)}
Tide: ${surfData.details.tide_state}, ${surfData.details.tide_height_ft}ft
Water: ${surfData.weather.water_temperature_f}°F
Overall: ${surfData.score}/100

Write 2-3 paragraphs in a friendly surfer voice covering wave quality, conditions, and recommendations.`

      const { object: fallbackResponse } = await generateObject({
        model: openai('gpt-4o-mini'),
        schema: surfReportSchema,
        prompt: fallbackPrompt,
        temperature: 0.4,
        maxTokens: 500,
      })
      
      const aiTime = (Bun.nanoseconds() - aiStart) / 1_000_000
      
      // Create report with fallback data
      const report = {
        id: `surf_bun_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        timestamp: new Date().toISOString(),
        location: surfData.location,
        report: fallbackResponse.report,
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
          board_type: fallbackResponse.boardRecommendation,
          skill_level: fallbackResponse.skillLevel,
          best_spots: fallbackResponse.bestSpots || ['Vilano Beach', 'St. Augustine Pier'],
          timing_advice: fallbackResponse.timingAdvice || 'Check conditions regularly'
        },
        cached_until: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        generation_meta: {
          generation_time_ms: Math.round(aiTime),
          total_time_ms: Math.round((Bun.nanoseconds() - startTime) / 1_000_000),
          backend: 'pure-bun-ultra-v2',
          model: 'gpt-4o-mini',
          report_length: fallbackResponse.report.length,
          generation_method: 'fallback'
        }
      }
      
      console.log(`🔄 Fallback generation successful: ${report.id} (${fallbackResponse.report.length} chars)`)
    }
    
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
      backend: 'pure-bun-ultra-v2',
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
        new_report_id: report.id,
        report_quality: {
          length: aiResponse.report.length,
          meets_minimum: aiResponse.report.length >= 250
        }
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

// Server configuration - Use PORT from environment or default to 3000 for Docker
const port = parseInt(process.env.PORT || '3000')

console.log(`🚀 Pure Bun Surf Lab starting on port ${port}`)
console.log(`⚡ Runtime: Bun ${Bun.version}`)
console.log(`🔗 Health: http://localhost:${port}/health`)
console.log(`🌊 Framework: Native Bun (no dependencies)`)

// Start the server
serve({
  port,
  development: process.env.NODE_ENV === 'development',
  async fetch(req: Request): Promise<Response> {
    try {
      return await handleRequest(req)
    } catch (error) {
      console.error('🚨 Request handler error:', error)
      return handleError(error as Error)
    }
  },
  error(error: Error): Response {
    console.error('🚨 Server error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
})

console.log(`✅ Pure Bun server running at http://localhost:${port}`)
console.log(`🏄‍♂️ Ready to generate detailed surf reports with maximum performance!`)