FROM node:20-alpine AS build
WORKDIR /app

COPY server/package.json server/tsconfig.json ./server/
WORKDIR /app/server
RUN npm install --no-audit --no-fund

COPY server/src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV MCP_TRANSPORT=http

COPY server/package.json ./server/
WORKDIR /app/server
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=build /app/server/dist ./dist
COPY catalog /app/catalog

ENV CATALOG_PATH=/app/catalog
EXPOSE 3100
CMD ["node", "dist/index.js"]
