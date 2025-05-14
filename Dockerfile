# Use the latest compatible Playwright image
FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /app

# Install yt-dlp and ffmpeg
RUN apt-get update && \
    apt-get install -y curl ffmpeg && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Copy your app
COPY . .

# Install Node.js dependencies
RUN npm install

EXPOSE 3000

CMD ["node", "index.js"]
