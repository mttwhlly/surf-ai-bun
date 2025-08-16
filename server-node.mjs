import { serve } from '@hono/node-server'
import { Hono } from 'hono'

const app = new Hono()

app.get('/health', (c) => {
  return c.json({ status: 'ok' })
})

const port = 9003
console.log(`Node.js server on port ${port}`)

serve({
  fetch: app.fetch,
  port
})
