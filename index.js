import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { join } from 'path';
import fs from 'fs';
import multer from 'multer';
import OpenAI from 'openai';

const execAsync = promisify(exec);
const unlinkAsync = promisify(fs.unlink);

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post('/transcribe', async (req, res) => {
  const { url } = req.body;

  if (!url) return res.status(400).json({ error: 'Missing video URL' });

  const fileBase = join(tmpdir(), `audio-${Date.now()}`);
  const outputPath = `${fileBase}.mp3`;

  try {
    // Download the audio from the video
    await execAsync(`yt-dlp -x --audio-format mp3 "${url}" -o "${fileBase}.%(ext)s"`);

    // Transcribe using OpenAI Whisper
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
app.listen(PORT, () => {
  console.log(`yt-dlp transcription service running on port ${PORT}`);
});
