// mynclex/app/(app)/admin/media-test/test-panel.tsx
//
// Client panel for the foundation smoke test. Pure exercise harness:
// upload a PDF via <UploadField>, then fetch a signed URL via the
// test server action and open it in a new tab. No real product copy
// — this exists to prove the foundation works end-to-end before any
// consumer feature ships.

'use client';

import { useState } from 'react';

import { UploadField } from '@/components/media/upload-field';
import { getTestAssetUrlAction } from './actions';

interface UploadedAsset {
  assetId: string;
  filename: string;
  sizeBytes: number;
}

export function MediaTestPanel() {
  const [asset, setAsset] = useState<UploadedAsset | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);

  const fetchUrl = async () => {
    if (!asset) return;
    setLoadingUrl(true);
    setUrlError(null);
    setSignedUrl(null);
    const result = await getTestAssetUrlAction(asset.assetId);
    setLoadingUrl(false);
    if (result.ok) {
      setSignedUrl(result.url);
    } else {
      setUrlError(result.error);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>
      <UploadField
        purpose="PDF_ACTIVITY"
        label="PDF file"
        hint="PDF only, max 25 MB. In Word: File → Export → PDF."
        onUploaded={(assetId, meta) => {
          setAsset({ assetId, filename: meta.filename, sizeBytes: meta.sizeBytes });
          setSignedUrl(null);
          setUrlError(null);
        }}
      />

      {asset ? (
        <div
          style={{
            padding: 12,
            border: '1px solid #e0e0e0',
            borderRadius: 6,
            background: '#fafafa',
            fontSize: 13,
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <strong>Asset created.</strong>
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 4 }}>
            asset_id: {asset.assetId}
          </div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 12 }}>
            {asset.filename} · {asset.sizeBytes.toLocaleString()} bytes
          </div>

          <button
            type="button"
            onClick={fetchUrl}
            disabled={loadingUrl}
            style={{
              padding: '6px 12px',
              fontSize: 13,
              cursor: loadingUrl ? 'wait' : 'pointer',
            }}
          >
            {loadingUrl ? 'Fetching…' : 'Fetch signed URL'}
          </button>

          {signedUrl ? (
            <div style={{ marginTop: 12 }}>
              <a href={signedUrl} target="_blank" rel="noopener noreferrer">
                Open PDF in new tab ↗
              </a>
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                (signed URL, valid 1 hour)
              </div>
            </div>
          ) : null}

          {urlError ? (
            <div style={{ marginTop: 12, color: '#d04040', fontSize: 12 }}>
              {urlError}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
