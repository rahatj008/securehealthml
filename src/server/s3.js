import fs from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const storageDriver = String(process.env.STORAGE_DRIVER || "s3").trim().toLowerCase();
const localStorageRoot = process.env.LOCAL_STORAGE_ROOT || path.join(process.cwd(), "local-storage");
const bucket = process.env.AWS_S3_BUCKET;

const s3Config = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || "us-east-1",
};

if (process.env.S3_ENDPOINT) {
  s3Config.endpoint = process.env.S3_ENDPOINT;
}
if (process.env.S3_FORCE_PATH_STYLE) {
  s3Config.forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";
}
if (process.env.S3_SSL_ENABLED) {
  s3Config.tls = process.env.S3_SSL_ENABLED === "true";
}

const s3 = new S3Client(s3Config);

function resolveLocalPath(key) {
  const normalizedKey = String(key || "").replace(/\\/g, "/").replace(/^\/+/, "");
  return path.join(localStorageRoot, normalizedKey);
}

async function uploadToFs({ key, buffer, contentType }) {
  const fullPath = resolveLocalPath(key);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, buffer);
  if (contentType) {
    await fs.writeFile(`${fullPath}.meta.json`, JSON.stringify({ contentType }), "utf-8");
  }
  return { Key: key };
}

async function downloadFromFs(key) {
  const fullPath = resolveLocalPath(key);
  const body = await fs.readFile(fullPath);
  let contentType = "application/octet-stream";
  try {
    const metadata = JSON.parse(await fs.readFile(`${fullPath}.meta.json`, "utf-8"));
    if (metadata?.contentType) {
      contentType = metadata.contentType;
    }
  } catch {
    // Best-effort metadata only.
  }
  return {
    Body: body,
    ContentType: contentType,
    ContentLength: body.length,
  };
}

async function deleteFromFs(key) {
  const fullPath = resolveLocalPath(key);
  await fs.rm(fullPath, { force: true });
  await fs.rm(`${fullPath}.meta.json`, { force: true });
  return {};
}

async function readS3Body(body) {
  if (!body) return new Uint8Array();
  if (body instanceof Uint8Array) return body;
  if (typeof body.transformToByteArray === "function") {
    return body.transformToByteArray();
  }

  const chunks = [];
  for await (const chunk of body) {
    chunks.push(chunk instanceof Uint8Array ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function uploadToS3({ key, buffer, contentType }) {
  if (storageDriver === "fs") {
    return uploadToFs({ key, buffer, contentType });
  }
  if (!bucket) throw new Error("AWS_S3_BUCKET not configured");
  const params = {
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  };
  if (process.env.S3_SERVER_SIDE_ENCRYPTION) {
    params.ServerSideEncryption = process.env.S3_SERVER_SIDE_ENCRYPTION;
  }
  const upload = new Upload({
    client: s3,
    params,
  });
  return upload.done();
}

export async function downloadFromS3(key) {
  if (storageDriver === "fs") {
    return downloadFromFs(key);
  }
  if (!bucket) throw new Error("AWS_S3_BUCKET not configured");
  const result = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
  return {
    ...result,
    Body: await readS3Body(result.Body),
  };
}

export async function deleteFromS3(key) {
  if (storageDriver === "fs") {
    return deleteFromFs(key);
  }
  if (!bucket) throw new Error("AWS_S3_BUCKET not configured");
  return s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}
