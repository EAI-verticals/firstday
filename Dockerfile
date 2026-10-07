FROM node:22-alpine AS builder
WORKDIR /app
ENV CYPRESS_INSTALL_BINARY=0
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts
COPY . .
ARG NEXT_PUBLIC_EAI_TENANT_ID
ENV NEXT_PUBLIC_EAI_TENANT_ID=$NEXT_PUBLIC_EAI_TENANT_ID
ENV NEXT_PUBLIC_APP_NAME=firstday
ENV APP_BASE_PATH=""
ENV NEXT_PUBLIC_APP_BASE_PATH=""
RUN test -n "$NEXT_PUBLIC_EAI_TENANT_ID" && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "require('http').get('http://127.0.0.1:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["node", "server.js"]
