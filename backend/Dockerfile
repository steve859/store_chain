# Dockerfile (backend)
FROM node:20

WORKDIR /app
COPY package*.json ./

# Prisma generate runs in postinstall, so the schema must exist before npm install
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev:docker"]
