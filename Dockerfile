FROM node:16-alpine
RUN apk add nginx

COPY dist/server /app/server
COPY dist/client/prototype-ui /app/frontend
COPY default-nginx.conf /etc/nginx/http.d/default.conf

WORKDIR /app/server
COPY start.sh .

ENTRYPOINT ["sh", "start.sh"]