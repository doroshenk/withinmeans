import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveFile } from './saveFile';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('P1-14: saveFile', () => {
  it('downloads the text as a JSON file with the given name, then frees the object URL', () => {
    const blobs: Blob[] = [];
    const revoke = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return 'blob:example';
      },
      revokeObjectURL: revoke,
    });
    const clicked: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push({ href: this.getAttribute('href') ?? '', download: this.download });
    });
    vi.useFakeTimers();

    saveFile('within-means-2026-11-18.json', '{"a":1}');

    expect(clicked).toEqual([{ href: 'blob:example', download: 'within-means-2026-11-18.json' }]);
    expect(blobs[0]?.type).toBe('application/json');
    expect(blobs[0]?.size).toBe('{"a":1}'.length);
    // Freed after the click has had a chance to start the download.
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:example');
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
