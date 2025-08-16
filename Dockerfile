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

# The bun user already exists in the base image, just use it
# Change ownership of app directory to existing bun user
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