// services/s3.service.js
import { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, s3BucketName, cloudFrontDomain } from "../config/aws.js";
import { logger } from "../utils/logger.js";

export const uploadFile = async (buffer, key, contentType) => {
  try {
    const command = new PutObjectCommand({
      Bucket: s3BucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await s3Client.send(command);

    if (cloudFrontDomain) {
      const baseDomain = cloudFrontDomain.endsWith("/")
        ? cloudFrontDomain.slice(0, -1)
        : cloudFrontDomain;
      return `${baseDomain}/${key}`;
    }

    return `https://${s3BucketName}.s3.amazonaws.com/${key}`;
  } catch (error) {
    logger.error(`AWS S3 upload error for key ${key}: ${error.message}`);
    throw error;
  }
};

export const deleteFile = async (key) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: s3BucketName,
      Key: key,
    });

    await s3Client.send(command);
    logger.info(`AWS S3 object deleted successfully: ${key}`);
  } catch (error) {
    logger.error(`AWS S3 delete error for key ${key}: ${error.message}`);
    throw error;
  }
};

export const downloadFileBuffer = async (key) => {
  try {
    const command = new GetObjectCommand({
      Bucket: s3BucketName,
      Key: key,
    });

    const response = await s3Client.send(command);
    if (!response.Body) {
      throw new Error("Empty body returned from S3 get request");
    }

    // Convert stream to Buffer
    const stream = response.Body;
    return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on("error", (err) => reject(err));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  } catch (error) {
    logger.error(`AWS S3 download error for key ${key}: ${error.message}`);
    throw error;
  }
};