import { AWS } from "./backend-require.js";

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const bucket = process.env.AWS_S3_BUCKET;

export async function uploadToS3({ key, buffer, contentType }) {
  if (!bucket) throw new Error("AWS_S3_BUCKET not configured");
  return s3
    .upload({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    })
    .promise();
}

export async function downloadFromS3(key) {
  if (!bucket) throw new Error("AWS_S3_BUCKET not configured");
  return s3
    .getObject({
      Bucket: bucket,
      Key: key,
    })
    .promise();
}

export async function deleteFromS3(key) {
  if (!bucket) throw new Error("AWS_S3_BUCKET not configured");
  return s3
    .deleteObject({
      Bucket: bucket,
      Key: key,
    })
    .promise();
}
