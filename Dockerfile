# Use an official Node.js image with Python preinstalled
FROM mcr.microsoft.com/playwright:v1.43.1-jammy

# Set working directory
WORKDIR /app

# Install yt-dlp and ffmpeg (required for audio extraction)
RUN apt-get update && \
    apt-get install -y curl ffmpeg && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Copy project files
COPY . .

# Install Node.js dependencies
RUN npm install

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "index.js"]
