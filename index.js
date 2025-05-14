import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import fs from 'fs';
import OpenAI from 'openai';
import { chromium } from 'playwright';
import fetch from 'node-fetch';

const execAsync = promisify(exec);
const unlinkAsync = promisify(fs.unlink);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
app.use(express.json());

// Step 1: Resolve TikTok short URL
async function resolveTikTokRedirect(shortUrl) {
  try {
    const res = await fetch(shortUrl, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });
    const location = res.headers.get("location");
    return location || shortUrl;
  } catch (err) {
    console.error("Redirect resolution failed:", err);
    return shortUrl;
  }
}

// Step 2: Scrape TikTok description and visible text
async function scrapeTikTokMetadata(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle' });

    const description = await page.evaluate(() => {
      const el = document.querySelector('div[data-e2e="browse-video-desc"], span[data-e2e="browse-video-desc"]');
      return el?.textContent?.trim() || "";
    });

    const title = await page.title();
    const visibleText = await page.evaluate(() => document.body.innerText);

    return {
      description,
      title,
      pageContent: visibleText?.slice(0, 5000) || "",
    };
  } catch (err) {
    console.error("Scraping error:", err);
    return {
      description: "N/A",
      title: "N/A",
      pageContent: "N/A",
    };
  } finally {
    await browser.close();
  }
}

// Step 3: Transcription endpoint
app.post('/transcribe', async (req, res) => {
  let { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing video URL' });

  const resolvedUrl = await resolveTikTokRedirect(url);
  const audioBase = join(tmpdir(), `audio-${Date.now()}`);
  const outputPath = `${audioBase}.mp3`;

  try {
    await execAsync(`yt-dlp -x --audio-format mp3 "${resolvedUrl}" -o "${audioBase}.%(ext)s"`);

    const transcriptResponse = await openai.audio.transcriptions.create({
      file: fs.createReadStream(outputPath),
      model: 'whisper-1',
      language: 'en',
      response_format: 'json',
    });

    const { description, title, pageContent } = await scrapeTikTokMetadata(resolvedUrl);

    await unlinkAsync(outputPath);

    return res.json({
      transcript: transcriptResponse.text,
      description,
      title,
      pageContent,
    });
  } catch (error) {
    console.error("Transcription error:", error);
    return res.status(500).json({ error: 'Failed to process video' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Transcription API running on port ${PORT}`));
