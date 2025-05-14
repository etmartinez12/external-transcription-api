# Use the official Playwright image
FROM mcr.microsoft.com/playwright:v1.43.0-jammy

# Set working directory
WORKDIR /app

# Copy everything into container
COPY . .

# Install dependencies
RUN npm install

# Expose port
EXPOSE 3000

# Start your server
CMD ["node", "index.js"]
