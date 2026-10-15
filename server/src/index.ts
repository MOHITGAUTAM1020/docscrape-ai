import { createApp } from './app.js';
import { config } from './config.js';
const runtime = await createApp();
runtime.httpServer.listen(config.port, '0.0.0.0', () =>
  console.log(`DocScrape AI API → http://localhost:${config.port} | ${config.provider} extraction`),
);
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  await runtime.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
