import type { S3Client } from '@aws-sdk/client-s3';

export interface ExportStore {
  put(key: string, body: string): Promise<void>;
}

export function createS3ExportStore(_deps: { client: S3Client; bucket: string }): ExportStore {
  return {
    async put() {
      throw new Error('not implemented');
    },
  };
}
