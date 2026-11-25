import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { createS3ExportStore } from './exportStore.js';

describe('P1-14: the S3 export store', () => {
  it('puts the JSON in the export bucket under the given key', async () => {
    const send = vi.fn((_command: unknown) => Promise.resolve({}));
    const store = createS3ExportStore({
      client: { send } as unknown as S3Client,
      bucket: 'example-bucket',
    });

    await store.put('households/h1.json', '{"a":1}');

    expect(send).toHaveBeenCalledOnce();
    const command = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'example-bucket',
      Key: 'households/h1.json',
      Body: '{"a":1}',
      ContentType: 'application/json',
    });
  });
});
