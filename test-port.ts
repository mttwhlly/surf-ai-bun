const server = Bun.serve({
  port: 8888,
  fetch(req) {
    return new Response(`Hello from ${req.url}`)
  },
})

console.log(`Server on port ${server.port}`)
