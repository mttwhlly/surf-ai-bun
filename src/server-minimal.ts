import { serve } from "bun"

const port = 9001

export default serve({
  port,
  fetch(req) {
    const url = new URL(req.url)
    
    if (url.pathname === '/health') {
      return new Response('{"status":"ok","timestamp":"' + new Date().toISOString() + '"}', {
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }
    
    if (url.pathname === '/test') {
      return new Response('Hello from Bun!')
    }
    
    return new Response('Not found', { status: 404 })
  },
})

console.log(`✅ Minimal server running on http://localhost:${port}`)
