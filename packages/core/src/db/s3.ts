import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import type { ProjectConfig } from '../config/schema';

/**
 * Downloads a database snapshot from S3 (no AWS SDK required — uses a pre-signed URL
 * or public-readable key) and imports it via the project's dbImport shell hook.
 *
 * For private buckets, generate a pre-signed URL and set it as S3_PRESIGNED_URL env var,
 * or add a custom download step in your globalSetup before calling runGlobalSetup.
 */
export async function downloadAndImportFromS3(config: ProjectConfig): Promise<void> {
  if (!config.shell?.dbImport) {
    throw new Error('[e2e-core] s3-import strategy requires a shell.dbImport hook to be configured.');
  }

  const presignedUrl = process.env.S3_PRESIGNED_URL;
  const bucket = config.db?.s3Bucket;
  const key = config.db?.s3Key;

  if (!presignedUrl && (!bucket || !key)) {
    throw new Error(
      '[e2e-core] s3-import strategy requires either S3_PRESIGNED_URL env var ' +
      'or db.s3Bucket + db.s3Key config values.',
    );
  }

  const downloadUrl = presignedUrl ?? `https://${bucket}.s3.amazonaws.com/${key}`;
  const dumpPath = config.db?.dumpPath ?? '/tmp/e2e-db-dump.sql';
  const dumpDir = path.dirname(dumpPath);

  if (!fs.existsSync(dumpDir)) {
    fs.mkdirSync(dumpDir, { recursive: true });
  }

  console.log(`[e2e-core] Downloading database snapshot from S3...`);
  await downloadFile(downloadUrl, dumpPath);
  console.log(`[e2e-core] Downloaded to ${dumpPath}, importing...`);
  await config.shell.dbImport(dumpPath);
  console.log('[e2e-core] S3 database import complete.');
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;
    client.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download DB snapshot: HTTP ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}
