FROM oven/bun:1-alpine

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --production

# Copy source code
COPY . .

# Create non-root user
RUN adduser -S bunuser
USER bunuser

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Start server
CMD ["bun", "run", "src/server.ts"]