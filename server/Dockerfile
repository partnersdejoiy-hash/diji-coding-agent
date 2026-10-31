# Multi-arch image (works on Oracle's Always Free Ampere A1 ARM VMs and AMD micro VMs).
FROM mcr.microsoft.com/playwright:v1.56.0-noble

WORKDIR /app
COPY web ./web
COPY server/package.json ./server/package.json
RUN cd server && npm install --omit=dev --no-audit --no-fund
COPY server ./server

ENV NODE_ENV=production PORT=8787
EXPOSE 8787
RUN mkdir -p /data && chown pwuser /data
USER pwuser
CMD ["node", "server/index.js"]
