import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import fs from 'fs';
import OpenAI from 'openai';

const execAsync = promisify(exec);
const unlinkAsync = promisify(fs.unlink);

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.post('/transcribe', async (req, res) => {
  let { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing video URL' });

  // 🔁 Expand short TikTok links
  url = await resolveRedirect(url);

  const fileBase = join(tmpdir(), `audio-${Date.now()}`);
  const outputPath = `${fileBase}.mp3`;

  try {
    await execAsync(`yt-dlp -x --audio-format mp3 "${url}" -o "${fileBase}.%(ext)s"`);

    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(outputPath),
      model: 'whisper-1',
      language: 'en',
      response_format: 'json',
    });

    await unlinkAsync(outputPath);
    return res.json({ transcript: response.text });
  } catch (error) {
    console.error('Transcription error:', error);
    return res.status(500).json({ error: 'Failed to transcribe audio' });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Transcription service running on port ${PORT}`));
