import fs from "node:fs/promises";
import path from "node:path";
import { AWS } from "./backend-require.js";

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
  s3Config.s3ForcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";
}
if (process.env.S3_SSL_ENABLED) {
  s3Config.sslEnabled = process.env.S3_SSL_ENABLED === "true";
}

const s3 = new AWS.S3(s3Config);

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
  return s3.upload(params).promise();
}

export async function downloadFromS3(key) {
  if (storageDriver === "fs") {
    return downloadFromFs(key);
  }
  if (!bucket) throw new Error("AWS_S3_BUCKET not configured");
  return s3
    .getObject({
      Bucket: bucket,
      Key: key,
    })
    .promise();
}

export async function deleteFromS3(key) {
  if (storageDriver === "fs") {
    return deleteFromFs(key);
  }
  if (!bucket) throw new Error("AWS_S3_BUCKET not configured");
  return s3
    .deleteObject({
      Bucket: bucket,
      Key: key,
    })
    .promise();
}
