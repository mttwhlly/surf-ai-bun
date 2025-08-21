import { serve } from 'bun'
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

function createEnhancedPrompt(surfData: any): string {
  // Extract all the key data we need
  const waveHeight = surfData.details.wave_height_ft;
  const wavePeriod = surfData.details.wave_period_sec; 
  const swellDirection = surfData.details.swell_direction_deg; 
  const windSpeed = Math.round(surfData.details.wind_speed_kts * 1.15078); // Convert to mph
  const windDirection = surfData.details.wind_direction_deg; 
  const tideState = surfData.details.tide_state;
  const airTemp = Math.round(surfData.weather.air_temperature_f); 
  const waterTemp = Math.round(surfData.weather.water_temperature_f); 
  const weatherDesc = surfData.weather.weather_description;
  const score = surfData.score;
  
  // Convert directions to readable compass directions
  const getCompassDirection = (degrees: number): string => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return directions[Math.round(degrees / 22.5) % 16];
  };
  
  const swellDir = getCompassDirection(swellDirection);
  const windDir = getCompassDirection(windDirection);
  
  // ✅ ENHANCED: Analyze swell quality based on period
  const getSwellQuality = (period: number): string => {
    if (period >= 12) return "long-period groundswell (high quality)";
    if (period >= 10) return "solid mid-period swell (good quality)";
    if (period >= 7) return "short-period swell (decent quality)";
    return "wind swell (lower quality)";
  };
  
  const swellQuality = getSwellQuality(wavePeriod);
  
  // ✅ ENHANCED: Wind analysis relative to swell
  const analyzeWind = (windDir: string, swellDir: string, windSpeed: number): string => {
    if (windSpeed < 5) return "light and clean";
    if (windSpeed < 10) return `light ${windDir} winds`;
    if (windSpeed < 15) return `moderate ${windDir} winds (${windSpeed} mph)`;
    return `strong ${windDir} winds (${windSpeed} mph)`;
  };
  
  const windAnalysis = analyzeWind(windDir, swellDir, windSpeed);
  
  return `Write a surf report for St. Augustine, FL as a local surfer would:

Current conditions:
- Waves: ${waveHeight} feet of ${swellQuality}
- Wave period: ${wavePeriod} seconds from the ${swellDir}
- Wind: ${windAnalysis}
- Tide: ${tideState}
- Air: ${airTemp}°F, Water: ${waterTemp}°F
- Weather: ${weatherDesc}
- Overall score: ${score}/100

Write 2-3 paragraphs about:
1. How the waves are looking and what the swell/wind is doing
2. Board recommendations and best surf spots in the area
3. Timing advice or any other local insights

Keep it conversational, friendly, and include the specific details about period, directions, and conditions. Write like you're talking to a friend who's asking about the surf.`;
}

async function generateSurfReport(surfData: any) {
  console.log('🤖 Generating enhanced surf report with complete data...');
  
  console.log('📊 Complete surf data for AI:', {
    waves: `${surfData.details.wave_height_ft}ft @ ${surfData.details.wave_period_sec}s`,
    swell: `${surfData.details.swell_direction_deg}° (${Math.round(surfData.details.swell_direction_deg/22.5)*22.5/22.5 > 8 ? 'offshore' : 'onshore'})`,
    wind: `${Math.round(surfData.details.wind_speed_kts * 1.15)}mph from ${surfData.details.wind_direction_deg}°`,
    tide: surfData.details.tide_state,
    temps: `Air: ${Math.round(surfData.weather.air_temperature_f)}°F, Water: ${Math.round(surfData.weather.water_temperature_f)}°F`,
    score: `${surfData.score}/100`
  });
  
  try {
    const prompt = createEnhancedPrompt(surfData);
    
    const { object: aiResponse } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: surfReportSchema,
      prompt,
      temperature: 0.4,
      maxTokens: 500, // Increased for more detailed reports
    })
    
    console.log(`✅ AI generated ${aiResponse.report.length} char enhanced report`);
    
    const report = {
      id: `surf_enhanced_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      location: surfData.location,
      report: aiResponse.report,
      conditions: {
        wave_height_ft: surfData.details.wave_height_ft,
        wave_period_sec: surfData.details.wave_period_sec, 
        wind_speed_kts: surfData.details.wind_speed_kts,
        wind_direction_deg: surfData.details.wind_direction_deg, 
        swell_direction_deg: surfData.details.swell_direction_deg, 
        tide_state: surfData.details.tide_state,
        weather_description: surfData.weather.weather_description,
        surfability_score: surfData.score,
        air_temperature_f: Math.round(surfData.weather.air_temperature_f),
        water_temperature_f: Math.round(surfData.weather.water_temperature_f)
      },
      recommendations: {
        board_type: aiResponse.boardRecommendation,
        skill_level: aiResponse.skillLevel,
        best_spots: aiResponse.bestSpots || ['Vilano Beach', 'St. Augustine Pier', 'Anastasia State Park'],
        timing_advice: aiResponse.timingAdvice || 'Check conditions regularly'
      },
      cached_until: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      generation_meta: {
        backend: 'bun-enhanced',
        model: 'gpt-4o-mini',
        report_length: aiResponse.report.length,
        data_completeness: 'full', // ✅ ALL DATA INCLUDED
        temperature_precision: 'whole_numbers'
      }
    }
    
    return report
    
  } catch (error) {
    console.error('❌ AI generation failed:', error)
    
    const windMph = Math.round(surfData.details.wind_speed_kts * 1.15078);
    const swellDir = surfData.details.swell_direction_deg;
    const windDir = surfData.details.wind_direction_deg;
    const period = surfData.details.wave_period_sec;
    
    const fallbackReport = `Surf check for St. Augustine! We've got ${surfData.details.wave_height_ft} foot waves with a ${period} second period coming from ${swellDir}°. Winds are ${windMph} mph from ${windDir}°. The tide is ${surfData.details.tide_state.toLowerCase()} which is creating ${surfData.score >= 60 ? 'decent' : 'mellow'} conditions. Air temp is ${Math.round(surfData.weather.air_temperature_f)}°F and water is ${Math.round(surfData.weather.water_temperature_f)}°F. ${surfData.details.wave_height_ft >= 3 ? 'Grab your shortboard' : 'Longboard conditions'} and hit up Vilano Beach or the pier for some waves!`
    
    return {
      id: `surf_fallback_enhanced_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toISOString(),
      location: surfData.location,
      report: fallbackReport,
      conditions: {
        wave_height_ft: surfData.details.wave_height_ft,
        wave_period_sec: surfData.details.wave_period_sec, 
        wind_speed_kts: surfData.details.wind_speed_kts,
        wind_direction_deg: surfData.details.wind_direction_deg, 
        swell_direction_deg: surfData.details.swell_direction_deg, 
        tide_state: surfData.details.tide_state,
        weather_description: surfData.weather.weather_description,
        surfability_score: surfData.score,
        air_temperature_f: Math.round(surfData.weather.air_temperature_f), 
        water_temperature_f: Math.round(surfData.weather.water_temperature_f) 
      },
      recommendations: {
        board_type: surfData.details.wave_height_ft >= 3 ? 'Shortboard' : 'Longboard',
        skill_level: surfData.score >= 65 ? 'intermediate' : 'beginner',
        best_spots: ['Vilano Beach', 'St. Augustine Pier', 'Anastasia State Park'],
        timing_advice: 'Check conditions regularly for changes'
      },
      cached_until: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      generation_meta: {
        backend: 'bun-enhanced-fallback',
        model: 'hardcoded-with-complete-data',
        report_length: fallbackReport.length,
        data_completeness: 'full',
        temperature_precision: 'whole_numbers'
      }
    }
  }
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const method = req.method
  
  console.log(`${method} ${url.pathname}`)
  
  if (method === 'OPTIONS') return corsResponse()
  
  // HEALTH CHECK
  if (method === 'GET' && url.pathname === '/health') {
    return jsonResponse({
      status: 'ok',
      service: 'Surf Lab AI (Enhanced Bun)',
      timestamp: new Date().toISOString(),
      runtime: 'Bun',
      version: Bun.version,
      features: ['complete_data_usage', 'rounded_temperatures', 'enhanced_prompts']
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
          backend: 'bun-enhanced',
          runtime: 'bun',
          data_quality: 'complete_with_all_fields'
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
      console.log('📊 Got complete surf data:', surfData.location)
      
      // Generate report using enhanced function
      const report = await generateSurfReport(surfData)
      
      console.log(`✅ Enhanced report generated: ${report.id}`)
      
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
          console.log('✅ Enhanced report saved successfully')
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
            length: report.generation_meta.report_length,
            backend: report.generation_meta.backend,
            data_completeness: report.generation_meta.data_completeness,
            temperature_precision: report.generation_meta.temperature_precision
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

console.log(`🚀 Enhanced Bun Surf Lab starting on port ${port}`)
console.log(`⚡ Runtime: Bun ${Bun.version}`)
console.log(`✅ Features: Complete data usage, rounded temps, enhanced prompts`)

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

console.log(`✅ Enhanced Bun server running at http://localhost:${port}`)