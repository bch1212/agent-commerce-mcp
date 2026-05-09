# Multi-stage build for the Halverson IQ Commerce MCP server.
FROM node:20-alpine AS build
WORKDIR /app

COPY server/package.json server/package-lock.json* server/tsconfig.json ./
RUN npm install --no-audit --no-fund

COPY server/src ./src
RUN npm run build

# ── Runtime image ────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV MCP_TRANSPORT=http

COPY server/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=build /app/dist ./dist
COPY catalog ./catalog

EXPOSE 3100
CMD ["node", "dist/index.js"]
