import { serve } from "bun"
import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

// SIMPLIFIED SCHEMA
const surfReportSchema = z.object({
  conditionsAnalysis: z.string().min(120).describe("First paragraph: Current wave, wind, and tide conditions with analysis"),
  recommendationsAndOutlook: z.string().min(100).describe("Second paragraph: Spot recommendations, gear advice, and bottom line"),
  
  // Structured recommendations (for API consumers)
  recommendations: z.object({
    boardType: z.string().describe("Recommended board type with size"),
    wetsuitThickness: z.string().optional().describe("Wetsuit recommendation"),
    skillLevel: z.enum(['beginner', 'intermediate', 'advanced']).describe("Recommended skill level"),
    bestSpots: z.array(z.string()).min(2).describe("Top 2-3 spot recommendations"),
    timingAdvice: z.string().describe("Best timing for today's session")
  })
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

// PROMPT FUNCTION
function createDetailedSurfPrompt(surfData: any): string {
  const windMph = Math.round(surfData.details.wind_speed_kts * 1.15078)
  const swellDirection = getSwellDirectionText(surfData.details.swell_direction_deg)
  const windDirection = getWindDirectionText(surfData.details.wind_direction_deg)
  
  return `You are an experienced local surf forecaster for St. Augustine, Florida. Write a concise but detailed 2-paragraph surf report that gives surfers everything they need to know.

CURRENT CONDITIONS:
• Wave Height: ${surfData.details.wave_height_ft} feet
• Wave Period: ${surfData.details.wave_period_sec} seconds  
• Swell Direction: ${surfData.details.swell_direction_deg}° (${swellDirection})
• Wind: ${windMph} mph ${windDirection}
• Tide: ${surfData.details.tide_state} (${surfData.details.tide_height_ft}ft)
• Water Temp: ${surfData.weather.water_temperature_f}°F
• Weather: ${surfData.weather.weather_description}
• Overall Score: ${surfData.score}/100

WRITE EXACTLY 2 PARAGRAPHS:

**Paragraph 1 - Conditions Analysis** (3-4 sentences):
Start with current wave conditions (${surfData.details.wave_height_ft}ft at ${surfData.details.wave_period_sec}s). Analyze the wave quality and power. Discuss wind impact (${windMph} mph ${windDirection}). Mention tide state and water temperature.

**Paragraph 2 - Recommendations & Outlook** (3-4 sentences):  
Recommend specific St. Augustine spots (Vilano Beach, St. Aug Pier, Crescent Beach, etc.). Give GENERAL board type recommendations (longboard for small/mellow waves, shortboard for bigger/steeper waves, funboard/mid-length for in-between) - DO NOT specify exact lengths or sizes. Suggest wetsuit for ${surfData.weather.water_temperature_f}°F water. Give timing advice and bottom line assessment.

BOARD GUIDANCE:
- Small waves (under 3ft): Recommend "longboard for easier wave catching"  
- Medium waves (3-5ft): Recommend "shortboard or funboard depending on your preference"
- Bigger waves (5ft+): Recommend "shortboard for better maneuverability"
- Never mention specific board lengths, volumes, or dimensions

TONE: Conversational local surfer who knows the area well. Be honest about conditions - don't oversell poor surf. Use some surf slang but keep it readable.`
}

// Update your structured recommendations schema to avoid specific sizes
const surfReportSchema = z.object({
  conditionsAnalysis: z.string().min(120).describe("First paragraph: Current wave, wind, and tide conditions with analysis"),
  recommendationsAndOutlook: z.string().min(100).describe("Second paragraph: Spot recommendations, gear advice, and bottom line"),
  
  // Structured recommendations (for API consumers)
  recommendations: z.object({
    boardType: z.string().describe("General board type recommendation (longboard, shortboard, funboard) - NO specific sizes"),
    wetsuitThickness: z.string().optional().describe("Wetsuit recommendation"),
    skillLevel: z.enum(['beginner', 'intermediate', 'advanced']).describe("Recommended skill level"),
    bestSpots: z.array(z.string()).min(2).describe("Top 2-3 spot recommendations"),
    timingAdvice: z.string().describe("Best timing for today's session")
  })
})

// Update your fallback function to give better board recommendations
function createEnhancedFallbackReport(surfData: any, windMph: number): string {
  const condition = surfData.score >= 70 ? 'good' : surfData.score >= 50 ? 'fair' : 'poor'
  const waveDesc = surfData.details.wave_height_ft >= 4 ? 'solid' : 
                   surfData.details.wave_height_ft >= 2 ? 'fun-sized' : 'small'
  
  // Use compass directions in the text
  const swellCompass = surfData.details.swell_direction_compass || 'unknown direction'
  const windCompass = surfData.details.wind_direction_compass || 'variable'
  
  // Better board recommendations based on wave size
  let boardRec: string;
  if (surfData.details.wave_height_ft >= 4) {
    boardRec = 'Grab your shortboard for better maneuverability in these bigger waves'
  } else if (surfData.details.wave_height_ft >= 2.5) {
    boardRec = 'A shortboard or funboard will work well for these conditions'
  } else {
    boardRec = 'Perfect longboard conditions - the extra length will help you catch these smaller waves'
  }
  
  const paragraph1 = `St. Augustine surf check shows ${waveDesc} ${surfData.details.wave_height_ft}ft waves at ${surfData.details.wave_period_sec} seconds coming from the ${swellCompass}, delivering ${surfData.details.wave_period_sec >= 10 ? 'decent power with some nice long rides' : 'quicker, choppier waves with less power'}. Wind is ${windMph} mph from the ${windCompass} which ${windMph < 10 ? 'is light enough for clean, glassy conditions' : 'is creating some texture and bump on the water'}. Tide is ${surfData.details.tide_state.toLowerCase()} at ${surfData.details.tide_height_ft}ft and water temp is ${surfData.weather.water_temperature_f}°F.`
  
  const paragraph2 = `${boardRec} and head to ${surfData.details.wave_height_ft >= 3 ? 'Vilano Beach or the pier area where the waves should have some punch' : 'Vilano Beach or Crescent Beach for the mellow, rolling waves'}. ${surfData.weather.water_temperature_f < 65 ? 'You\'ll want a wetsuit for that chilly water' : 'Spring suit or boardshorts should be perfect for the comfortable water temps'}. ${condition === 'good' ? 'Definitely worth the paddle out today!' : condition === 'fair' ? 'Surfable conditions if you need your wave fix.' : 'Might be better for beach walks, but conditions can change quickly.'}`
  
  return `${paragraph1}\n\n${paragraph2}`
}

// Helper functions for better context
function getSwellDirectionText(degrees: number): string {
  if (degrees >= 315 || degrees < 45) return 'North'
  if (degrees >= 45 && degrees < 135) return 'East'
  if (degrees >= 135 && degrees < 225) return 'South'
  return 'West'
}

function getWindDirectionText(degrees: number): string {
  const directions = ['North', 'NNE', 'NE', 'ENE', 'East', 'ESE', 'SE', 'SSE', 
                     'South', 'SSW', 'SW', 'WSW', 'West', 'WNW', 'NW', 'NNW']
  const index = Math.round(degrees / 22.5) % 16
  return directions[index]
}

function getWaveQuality(height: number, period: number): string {
  if (period >= 12) return 'This is quality groundswell with good power and long rides.'
  if (period >= 8) return 'Decent swell with moderate power and rideable waves.'
  if (period >= 6) return 'Short period wind swell - waves will be quick and choppy.'
  return 'Very short period - expect weak, mushy waves.'
}

function getTideContext(tideState: string): string {
  if (tideState.includes('Rising')) return 'Rising tide usually brings cleaner waves and better shape.'
  if (tideState.includes('Falling')) return 'Falling tide can expose more sandbars but may get shallower.'
  if (tideState.includes('High')) return 'High tide offers deeper water but waves may be mushier.'
  if (tideState.includes('Low')) return 'Low tide exposes sandbars - watch for shallow sections.'
  return 'Mid tide typically offers the most consistent conditions.'
}

// REPORT GENERATION
async function generateDetailedSurfReport(surfData: any) {
  console.log('🤖 Generating detailed surf report with compass directions...')
  
  try {
    const prompt = createDetailedSurfPrompt(surfData)
    
    const { object: aiResponse } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: surfReportSchema,
      prompt,
      temperature: 0.6,
      maxTokens: 500,
    })
    
    const fullReport = [
      aiResponse.conditionsAnalysis,
      aiResponse.recommendationsAndOutlook
    ].join('\n\n')
    
    console.log(`✅ AI generated report (${fullReport.split(' ').length} words)`)
    
    // 🆕 ENHANCED: Include ALL compass and environmental data
    const report = {
      id: `surf_2para_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      location: surfData.location,
      report: fullReport,
      conditions: {
        // Basic wave/wind data (existing)
        wave_height_ft: surfData.details.wave_height_ft,
        wave_period_sec: surfData.details.wave_period_sec,
        wind_speed_kts: surfData.details.wind_speed_kts,
        wind_direction_deg: surfData.details.wind_direction_deg,
        tide_state: surfData.details.tide_state,
        weather_description: surfData.weather.weather_description,
        surfability_score: surfData.score,
        
        // 🆕 ADD: Compass directions and descriptions
        swell_direction_deg: surfData.details.swell_direction_deg,
        swell_direction_compass: surfData.details.swell_direction_compass,
        swell_direction_text: surfData.details.swell_direction_text,
        swell_direction_description: surfData.details.swell_direction_description,
        wind_direction_compass: surfData.details.wind_direction_compass,
        wind_direction_text: surfData.details.wind_direction_text,
        wind_direction_description: surfData.details.wind_direction_description,
        
        // 🆕 ADD: Environmental data
        tide_height_ft: surfData.details.tide_height_ft,
        water_temperature_c: surfData.weather.water_temperature_c,
        water_temperature_f: surfData.weather.water_temperature_f,
        air_temperature_c: surfData.weather.air_temperature_c,
        air_temperature_f: surfData.weather.air_temperature_f
      },
      recommendations: {
        board_type: aiResponse.recommendations.boardType,
        wetsuit_thickness: aiResponse.recommendations.wetsuitThickness,
        skill_level: aiResponse.recommendations.skillLevel,
        best_spots: aiResponse.recommendations.bestSpots,
        timing_advice: aiResponse.recommendations.timingAdvice
      },
      cached_until: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      generation_meta: {
        backend: 'bun-enhanced-with-compass',
        model: 'gpt-4o-mini',
        report_length: fullReport.length,
        word_count: fullReport.split(' ').length,
        paragraphs: 2,
        prompt_version: '2.2',
        includes_compass_data: true
      }
    }
    
    console.log('✅ Generated enhanced report with compass data:', {
      reportId: report.id,
      windCompass: report.conditions.wind_direction_compass,
      swellCompass: report.conditions.swell_direction_compass,
      hasAllFields: !!(report.conditions.wind_direction_compass && report.conditions.swell_direction_compass)
    })
    
    return report
    
  } catch (error) {
    console.error('❌ Enhanced AI generation failed:', error)
    
    // Enhanced fallback with compass data too
    const windMph = Math.round(surfData.details.wind_speed_kts * 1.15078)
    const fallbackReport = createEnhancedFallbackReport(surfData, windMph)

    function getBoardTypeRecommendation(waveHeight: number): string {
      if (waveHeight >= 4) {
        return 'Shortboard recommended'
      } else if (waveHeight >= 2.5) {
        return 'Shortboard or funboard'
      } else {
        return 'Longboard recommended'
      }
    }
    
    return {
      id: `surf_fallback_enhanced_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      location: surfData.location,
      report: fallbackReport,
      conditions: {
        // Basic data
        wave_height_ft: surfData.details.wave_height_ft,
        wave_period_sec: surfData.details.wave_period_sec,
        wind_speed_kts: surfData.details.wind_speed_kts,
        wind_direction_deg: surfData.details.wind_direction_deg,
        tide_state: surfData.details.tide_state,
        weather_description: surfData.weather.weather_description,
        surfability_score: surfData.score,
        
        // 🆕 Compass data in fallback too
        swell_direction_deg: surfData.details.swell_direction_deg,
        swell_direction_compass: surfData.details.swell_direction_compass,
        swell_direction_text: surfData.details.swell_direction_text,
        swell_direction_description: surfData.details.swell_direction_description,
        wind_direction_compass: surfData.details.wind_direction_compass,
        wind_direction_text: surfData.details.wind_direction_text,
        wind_direction_description: surfData.details.wind_direction_description,
        
        // Environmental data
        tide_height_ft: surfData.details.tide_height_ft,
        water_temperature_c: surfData.weather.water_temperature_c,
        water_temperature_f: surfData.weather.water_temperature_f,
        air_temperature_c: surfData.weather.air_temperature_c,
        air_temperature_f: surfData.weather.air_temperature_f
      },
      recommendations: {
          board_type: getBoardTypeRecommendation(surfData.details.wave_height_ft),

        wetsuit_thickness: surfData.weather.water_temperature_f < 65 ? '3/2mm' : 'Spring suit',
        skill_level: surfData.score >= 65 ? 'intermediate' : 'beginner',
        best_spots: ['Vilano Beach', 'St. Augustine Pier', 'Crescent Beach'],
        timing_advice: 'Check conditions regularly as they change throughout the day'
      },
      cached_until: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      generation_meta: {
        backend: 'bun-enhanced-fallback',
        model: 'hardcoded-with-compass',
        report_length: fallbackReport.length,
        word_count: fallbackReport.split(' ').length,
        paragraphs: 2,
        prompt_version: '2.2',
        includes_compass_data: true
      }
    }
  }
}

// 🆕 Enhanced fallback that uses compass directions in text
function createEnhancedFallbackReport(surfData: any, windMph: number): string {
  const condition = surfData.score >= 70 ? 'good' : surfData.score >= 50 ? 'fair' : 'poor'
  const waveDesc = surfData.details.wave_height_ft >= 4 ? 'solid' : 
                   surfData.details.wave_height_ft >= 2 ? 'fun-sized' : 'small'
  
  // Use compass directions in the text
  const swellCompass = surfData.details.swell_direction_compass || 'unknown direction'
  const windCompass = surfData.details.wind_direction_compass || 'variable'
  
  const paragraph1 = `St. Augustine surf check shows ${waveDesc} ${surfData.details.wave_height_ft}ft waves at ${surfData.details.wave_period_sec} seconds coming from the ${swellCompass}, delivering ${surfData.details.wave_period_sec >= 10 ? 'decent power with some nice long rides' : 'quicker, choppier waves with less power'}. Wind is ${windMph} mph from the ${windCompass} which ${windMph < 10 ? 'is light enough for clean, glassy conditions' : 'is creating some texture and bump on the water'}. Tide is ${surfData.details.tide_state.toLowerCase()} at ${surfData.details.tide_height_ft}ft and water temp is ${surfData.weather.water_temperature_f}°F.`
  
  const paragraph2 = `${surfData.details.wave_height_ft >= 3 ? 'Grab your shortboard and head to Vilano Beach or the pier area where the waves should have some punch' : 'Perfect longboard day - try Vilano Beach or Crescent Beach for the mellow, rolling waves'}. ${surfData.weather.water_temperature_f < 65 ? 'You\'ll want a 3/2mm wetsuit for that chilly water' : 'Spring suit or boardshorts should be perfect for the comfortable water temps'}. ${condition === 'good' ? 'Definitely worth the paddle out today!' : condition === 'fair' ? 'Surfable conditions if you need your wave fix.' : 'Might be better for beach walks, but conditions can change quickly.'}`
  
  return `${paragraph1}\n\n${paragraph2}`
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
      service: 'Can I Surf Today?',
      timestamp: new Date().toISOString(),
      runtime: 'Bun',
      version: Bun.version,
      features: ['detailed-reports', 'multi-paragraph', 'enhanced-prompts']
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
      
      const report = await generateDetailedSurfReport(surfData)
      
      return jsonResponse({
        success: true,
        report,
        performance: {
          backend: 'bun-enhanced',
          runtime: 'bun',
          features: ['detailed-structure', 'multiple-paragraphs', 'enhanced-prompts']
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
  
  // CRON GENERATION (same logic, calls the detailed function)
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
      
      // Generate 2-paragraph report
      const report = await generateDetailedSurfReport(surfData)
      
      console.log(`✅ Detailed report generated: ${report.id} (${report.generation_meta.word_count} words)`)
      
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
          console.log('✅ Detailed report saved successfully')
        } else {
          console.warn('⚠️ Save failed but continuing:', saveResponse.status)
        }
        
      } catch (saveError) {
        console.warn('⚠️ Save error but continuing:', saveError)
      }
      
      return jsonResponse({
        success: true,
        timestamp: new Date().toISOString(),
        backend: 'bun-enhanced',
        actions: {
          surf_data_fetched: true,
          ai_report_generated: true,
          new_report_id: report.id,
          report_quality: {
            word_count: report.generation_meta.word_count,
            sections: report.generation_meta.sections,
            length: report.generation_meta.report_length,
            backend: report.generation_meta.backend
          }
        }
      })
      
    } catch (error) {
      console.log('❌ Enhanced cron endpoint failed:', error)
      return jsonResponse({
        success: false,
        error: '2-paragraph cron failed',
        details: error instanceof Error ? error.message : String(error)
      }, 500)
    }
  }
  
  return jsonResponse({ error: 'Not found' }, 404)
}

// START SERVER
const port = parseInt(process.env.PORT || '3000')

console.log(`🚀 Can I Surf Today? starting on port ${port}`)
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

console.log(`✅ Bun server running at http://localhost:${port}`)