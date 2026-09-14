FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY services/api/package.json services/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/mobile/package.json apps/mobile/package.json
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build -w @kmart/api
RUN npm prune --omit=dev --ignore-scripts

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/services/api/dist ./services/api/dist
COPY --from=build --chown=node:node /app/services/api/package.json ./services/api/package.json
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "services/api/dist/server.js"]
