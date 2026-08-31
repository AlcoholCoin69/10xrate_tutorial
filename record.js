import puppeteer from 'puppeteer';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function record() {
  console.log('Запуск записи видео анимации...');
  
  const width = 1920;
  const height = 1080;
  const fps = 60;
  const outputVideo = path.join(__dirname, '10xrate_registration.mp4');

  // Spawn ffmpeg
  const ffmpeg = spawn(ffmpegPath, [
    '-y',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-r', `${fps}`,
    '-i', '-',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '14',
    '-pix_fmt', 'yuv420p',
    outputVideo
  ]);

  ffmpeg.stderr.on('data', (data) => {
    // optional logging
  });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--hide-scrollbars',
      '--disable-web-security',
      `--window-size=${width},${height}`
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({
    width,
    height,
    deviceScaleFactor: 2
  });

  const htmlUrl = `file://${path.join(__dirname, 'anima.html').replace(/\\/g, '/')}`;
  await page.goto(htmlUrl, { waitUntil: 'networkidle0' });

  console.log('Захват кадров (60 FPS)...');

  const client = await page.target().createCDPSession();
  await client.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 100,
    everyNthFrame: 1
  });

  let frameCount = 0;
  client.on('Page.screencastFrame', async ({ data, sessionId }) => {
    try {
      const buffer = Buffer.from(data, 'base64');
      ffmpeg.stdin.write(buffer);
      frameCount++;
      await client.send('Page.screencastFrameAck', { sessionId });
    } catch (e) {
      // stream ended
    }
  });

  // Wait for 1 complete natural cycle (~22 seconds)
  await new Promise(r => setTimeout(r, 22000));

  console.log(`Записано кадров: ${frameCount}. Финализация видео...`);
  await client.send('Page.stopScreencast');
  await browser.close();

  ffmpeg.stdin.end();
  await new Promise((resolve) => {
    ffmpeg.on('close', resolve);
  });

  console.log(`Готово! Видео сохранено в: ${outputVideo}`);
}

record().catch(console.error);
