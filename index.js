import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import fs from 'fs';
import OpenAI from 'openai';
import { chromium } from "playwright";

// import { chromium } from 'playwright-extra';
// import StealthPlugin from 'playwright-extra-plugin-stealth';

chromium.use(StealthPlugin());

const execAsync = promisify(exec);
const unlinkAsync = promisify(fs.unlink);

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function cleanPageContent(content) {
  return content
    .split('\n')
    .filter(
      (line) =>
        line.trim().length > 5 &&
        !line.toLowerCase().includes('login') &&
        !line.toLowerCase().includes('follow') &&
        !line.toLowerCase().includes('share') &&
        !line.toLowerCase().includes('comment')
    )
    .slice(0, 50)
    .join('\n');
}

async function extractTikTokContentWithPlaywright(url) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6000); // Let JS load

    const description = await page.evaluate(() => {
      const selectors = [
        '[data-e2e="browse-video-desc"]',
        'h1',
        'article > div > div > span',
      ];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) return el.textContent.trim();
      }

      const fallback = Array.from(document.querySelectorAll('span'))
        .map((el) => el.textContent?.trim())
        .find((t) => t && t.length > 50);

      return fallback || '';
    });

    const bodyText = await page.evaluate(() => document.body.innerText);
    return {
      description: description || 'N/A',
      cleanedContent: cleanPageContent(bodyText || ''),
    };
  } catch (err) {
    console.error('❌ Playwright error:', err);
    return {
      description: 'N/A',
      cleanedContent: 'N/A',
    };
  } finally {
    await browser.close();
  }
}

async function downloadAudio(url) {
  const outputBase = join(tmpdir(), `audio-${Date.now()}`);
  const outputPath = `${outputBase}.mp3`;

  try {
    await execAsync(
      `yt-dlp -x --audio-format mp3 "${url}" -o "${outputBase}.%(ext)s"`
    );
    return outputPath;
  } catch (error) {
    console.error('Audio download failed:', error);
    return null;
  }
}

async function transcribeAudio(audioPath) {
  if (!audioPath) return 'N/A';

  try {
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: 'whisper-1',
      language: 'en',
      response_format: 'json',
    });

    return response.text;
  } catch (error) {
    console.error('Transcription failed:', error);
    return 'N/A';
  } finally {
    try {
      if (audioPath) await unlinkAsync(audioPath);
    } catch (err) {
      console.error('Failed to delete audio file:', err);
    }
  }
}

app.post('/transcribe', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing video URL' });

  let transcript = 'N/A';
  try {
    const audioPath = await downloadAudio(url);
    transcript = await transcribeAudio(audioPath);
  } catch {
    console.warn('Skipping transcript step.');
  }

  try {
    const { description, cleanedContent } =
      await extractTikTokContentWithPlaywright(url);

    const title =
      description !== 'N/A' ? description.slice(0, 50) : 'Unknown Recipe';

    return res.json({
      success: true,
      title,
      transcript,
      description,
      cleanedContent,
    });
  } catch (error) {
    console.error('Failed to fetch or parse content:', error);
    return res.status(500).json({ error: 'Scraping failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`✅ Server running on port ${PORT}`)
);
