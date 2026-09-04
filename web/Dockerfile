# Multi-stage build: Next.js static export, served by nginx
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Same-origin API calls: nginx proxies /api/* to the api service
ENV NEXT_PUBLIC_API_URL=""
RUN npm run build

FROM nginx:1.27-alpine
# openssl CLI is needed to generate the self-signed placeholder certificate
RUN apk add --no-cache openssl
COPY --from=build /app/out /usr/share/nginx/html
# nginx.conf is generated at container start from config.yaml by entrypoint.sh
COPY locations.conf /etc/nginx/locations.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 80 443
ENTRYPOINT ["/bin/sh", "/entrypoint.sh"]
