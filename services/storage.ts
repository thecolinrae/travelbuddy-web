/**
 * S3-compatible file storage service.
 *
 * Configured via environment variables — works with AWS S3, Cloudflare R2,
 * Backblaze B2, or self-hosted MinIO. All functions are server-side only.
 *
 * Required env vars:
 *   S3_ENDPOINT    — full URL, e.g. http://minio:9000 or https://s3.amazonaws.com
 *   S3_BUCKET      — bucket name
 *   S3_ACCESS_KEY  — access key ID
 *   S3_SECRET_KEY  — secret access key
 *   S3_REGION      — region (use "auto" for R2, "us-east-1" for MinIO)
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function getS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
    // Required for MinIO path-style URLs (http://host/bucket/key vs http://bucket.host/key)
    forcePathStyle: true,
  });
}

const BUCKET = process.env.S3_BUCKET ?? 'travelbuddy';

let bucketEnsured = false;

async function ensureBucket(s3: S3Client): Promise<void> {
  if (bucketEnsured) return;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    try {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    } catch {
      // Already exists or no permission — proceed anyway
    }
  }
  bucketEnsured = true;
}

/**
 * Upload a file buffer to S3.
 * Returns the storage path (S3 object key) for later retrieval.
 *
 * Path convention: `artifacts/{tripId}/{fileName}`
 */
export async function uploadArtifact(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  tripId: string,
): Promise<string> {
  const s3 = getS3Client();
  await ensureBucket(s3);
  // Sanitize fileName: replace spaces and special chars
  const safe = fileName.replace(/[^a-zA-Z0-9._\-() ]/g, '_');
  const storagePath = `artifacts/${tripId}/${safe}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: storagePath,
      Body: buffer,
      ContentType: mimeType,
      ContentDisposition: `attachment; filename="${safe}"`,
    }),
  );

  return storagePath;
}

/**
 * Generate a presigned URL for temporary read access (1 hour expiry).
 * Use this to serve artifact downloads to the browser.
 */
export async function getArtifactUrl(storagePath: string): Promise<string> {
  const s3 = getS3Client();
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: storagePath }),
    { expiresIn: 3600 },
  );
}

/**
 * Delete an artifact from S3. Called when an artifact record is removed.
 */
export async function deleteArtifact(storagePath: string): Promise<void> {
  const s3 = getS3Client();
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: storagePath }));
}
