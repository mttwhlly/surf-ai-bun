const server = Bun.serve({
  port: 9002,
  fetch() {
    return new Response("OK")
  },
})

console.log(`Server on port ${server.port}`)
