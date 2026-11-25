import { useState } from 'react';
import { GENERIC_ERROR } from '../auth/errors';
import type { ExportResult } from './Hello';

/**
 * Spec §8: "Download my data". Open to view-only members too, since it only reads. No artboard:
 * it sits on the dashboard placeholder.
 */
export function DownloadData({
  exportData,
  saveFile,
}: {
  exportData: () => Promise<ExportResult>;
  saveFile: (name: string, text: string) => void;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');

  async function download() {
    setState('busy');
    try {
      const result = await exportData();
      saveFile(`within-means-${result.exportedOn}.json`, JSON.stringify(result, null, 2));
      setState('idle');
    } catch {
      setState('failed');
    }
  }

  return (
    <>
      <button
        type="button"
        className="button button-quiet"
        disabled={state === 'busy'}
        onClick={() => void download()}
      >
        Download my data
      </button>
      {state === 'failed' && <p role="alert">{GENERIC_ERROR}</p>}
    </>
  );
}
