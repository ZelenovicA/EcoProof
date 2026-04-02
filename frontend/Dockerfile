FROM node:20-alpine
WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm ci --silent

# Copy source and expose Vite dev server
COPY . .
EXPOSE 3000

# Start dev server allowing external access
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
