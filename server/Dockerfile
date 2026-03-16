FROM node:20-slim
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Cloud Run uses PORT env var (default 8080)
EXPOSE 8080

CMD ["node", "dist/index.js"]
