# Dockerfile (backend)
FROM node:20

WORKDIR /app/backend

# Install deps first (better cache). Prisma generate runs in postinstall,
# so schema/config must exist before npm install.
COPY backend/package*.json ./
COPY backend/prisma ./prisma
COPY backend/prisma.config.ts ./
RUN npm install

# Copy backend source
COPY backend/ ./

EXPOSE 3000
CMD ["npm", "run", "dev:docker"]
