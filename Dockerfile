FROM oven/bun:1-alpine
RUN apk add --no-cache curl
WORKDIR /app
COPY package.json bun.lockb* ./
RUN bun install --production
COPY . .
RUN adduser -S bunuser
USER bunuser
EXPOSE 3001
HEALTHCHECK CMD curl -f http://localhost:3001/health || exit 1
CMD ["bun", "run", "src/server.ts"]
