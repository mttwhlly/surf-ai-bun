# Use Bun's official Docker image
FROM oven/bun:1.1.29-alpine

# Set working directory
WORKDIR /app

# Install curl for healthchecks (Coolify requirement)
RUN apk add --no-cache curl

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy source code
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S bun && \
    adduser -S bun -u 1001

# Change ownership of app directory
RUN chown -R bun:bun /app
USER bun

# Expose port 3000 (default for Coolify)
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Health check for Coolify
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["bun", "run", "index.ts"]