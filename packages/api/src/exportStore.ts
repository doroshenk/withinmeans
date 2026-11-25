import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';

export interface ExportStore {
  put(key: string, body: string): Promise<void>;
}

/** The export bucket (JobsStack). It encrypts and versions every object itself. */
export function createS3ExportStore(deps: { client: S3Client; bucket: string }): ExportStore {
  const { client, bucket } = deps;
  return {
    async put(key, body) {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: 'application/json',
        }),
      );
    },
  };
}
