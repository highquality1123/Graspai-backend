FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY . .

RUN yarn install
RUN yarn build

EXPOSE 3100

CMD ["node", "dist/main"]

