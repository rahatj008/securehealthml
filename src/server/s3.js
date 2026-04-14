import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const REQUIRED_AWS_S3_ENV_KEYS = [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "AWS_S3_BUCKET",
];

let s3Client;

function normalizeEnvValue(value) {
  return String(value || "").trim();
}

export function getMissingAwsS3EnvKeys() {
  return REQUIRED_AWS_S3_ENV_KEYS.filter((key) => !normalizeEnvValue(process.env[key]));
}

export function validateAwsS3Config() {
  const missingKeys = getMissingAwsS3EnvKeys();
  if (missingKeys.length) {
    throw new Error(`AWS S3 configuration is incomplete. Missing: ${missingKeys.join(", ")}`);
  }
}

function getBucketName() {
  validateAwsS3Config();
  return normalizeEnvValue(process.env.AWS_S3_BUCKET);
}

function getS3Client() {
  validateAwsS3Config();
  if (!s3Client) {
    s3Client = new S3Client({
      credentials: {
        accessKeyId: normalizeEnvValue(process.env.AWS_ACCESS_KEY_ID),
        secretAccessKey: normalizeEnvValue(process.env.AWS_SECRET_ACCESS_KEY),
      },
      region: normalizeEnvValue(process.env.AWS_REGION),
    });
  }
  return s3Client;
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
  const params = {
    Bucket: getBucketName(),
    Key: key,
    Body: buffer,
    ContentType: contentType,
  };

  if (normalizeEnvValue(process.env.S3_SERVER_SIDE_ENCRYPTION)) {
    params.ServerSideEncryption = normalizeEnvValue(process.env.S3_SERVER_SIDE_ENCRYPTION);
  }

  const upload = new Upload({
    client: getS3Client(),
    params,
  });

  return upload.done();
}

export async function downloadFromS3(key) {
  const result = await getS3Client().send(
    new GetObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    })
  );

  return {
    ...result,
    Body: await readS3Body(result.Body),
  };
}

export async function deleteFromS3(key) {
  return getS3Client().send(
    new DeleteObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    })
  );
}
