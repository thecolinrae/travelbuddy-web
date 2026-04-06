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

function getS3Client(endpoint?: string): S3Client {
  return new S3Client({
    endpoint: endpoint ?? process.env.S3_ENDPOINT,
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
 *
 * In Docker dev the S3 client talks to the internal service hostname (e.g.
 * http://storage:9000) which browsers cannot resolve. Set S3_PUBLIC_ENDPOINT
 * to the browser-accessible base URL (e.g. http://localhost:9000) and the
 * presigned URL will be signed against that hostname directly, so the
 * signature remains valid when the browser sends the request.
 */
export async function getArtifactUrl(storagePath: string): Promise<string> {
  // Sign against the public endpoint when set — the browser sends the request
  // to that host, so the signature must be computed with that hostname.
  const signingEndpoint = process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT;
  const s3 = getS3Client(signingEndpoint);
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET, Key: storagePath }),
    { expiresIn: 3600 },
  );
}

/**
 * Download an artifact from S3 as a Buffer.
 * Used by the export service to bundle artifacts into ZIP packages.
 */
export async function downloadArtifact(storagePath: string): Promise<Buffer> {
  const s3 = getS3Client();
  const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: storagePath }));
  const bytes = await (response.Body as import('@aws-sdk/types').SdkStreamMixin).transformToByteArray();
  return Buffer.from(bytes);
}

/**
 * Delete an artifact from S3. Called when an artifact record is removed.
 */
export async function deleteArtifact(storagePath: string): Promise<void> {
  const s3 = getS3Client();
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: storagePath }));
}
