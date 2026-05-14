// mynclex/components/media/upload-field.tsx
//
// Generic file-upload control. Renders a file picker, validates the
// pick against PURPOSE_CONFIG client-side for a fast error, and calls
// uploadAssetAction on the server. On success it surfaces the new
// asset_id to its parent via onUploaded; on failure it shows an inline
// error. Parents decide what to do with the asset_id (stash it on a
// form value, save it on a row, render a preview, etc.).
//
// Auto-uploads on file pick — single-click UX. To replace the file the
// user picks a different one; to clear, they hit the "×" once an
// upload is in flight or complete.
//
// This is purpose-agnostic. PDF activity, avatars, rationale images,
// future videos all mount the same component with a different
// `purpose` prop. Per-purpose validation lives in PURPOSE_CONFIG; the
// component only renders the result.

'use client';

import { useRef, useState } from 'react';

import { uploadAssetAction } from '@/lib/media/actions';
import { PURPOSE_CONFIG, type Purpose } from '@/lib/media/types';

type UploadState =
  | { kind: 'idle' }
  | { kind: 'uploading'; filename: string; sizeBytes: number }
  | { kind: 'done'; assetId: string; filename: string; sizeBytes: number }
  | { kind: 'error'; message: string };


interface UploadFieldProps {
  purpose: Purpose;
  /** Called once the upload completes successfully. */
  onUploaded?: (assetId: string, meta: { filename: string; sizeBytes: number }) => void;
  /** Optional helper text shown under the picker — e.g. "PDF only. Word → File → Export → PDF." */
  hint?: string;
  /** Label above the picker. Defaults to "File". */
  label?: string;
  disabled?: boolean;
}


function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


export function UploadField({
  purpose,
  onUploaded,
  hint,
  label = 'File',
  disabled = false,
}: UploadFieldProps) {
  const config = PURPOSE_CONFIG[purpose];
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ kind: 'idle' });

  // Build the accept= string from the config. Browsers use it as a
  // hint in the file picker; it's not enforcement — that's in
  // uploadAssetAction and at the bucket level.
  const acceptAttr = config.allowedMimeTypes.join(',');
  const maxMb = Math.round(config.maxSizeBytes / (1024 * 1024));

  const reset = () => {
    setState({ kind: 'idle' });
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side pre-flight so the user gets feedback without a
    // server round-trip on obvious failures. The server action
    // re-checks both rules authoritatively.
    if (!config.allowedMimeTypes.includes(file.type)) {
      setState({
        kind: 'error',
        message: `File type not allowed. Accepted: ${config.allowedMimeTypes.join(', ')}.`,
      });
      return;
    }
    if (file.size > config.maxSizeBytes) {
      setState({ kind: 'error', message: `File is too large. Max ${maxMb} MB.` });
      return;
    }

    setState({ kind: 'uploading', filename: file.name, sizeBytes: file.size });

    const result = await uploadAssetAction(file, purpose);
    if (!result.ok) {
      setState({ kind: 'error', message: result.error });
      return;
    }

    setState({
      kind: 'done',
      assetId: result.assetId,
      filename: result.originalFilename,
      sizeBytes: result.sizeBytes,
    });
    onUploaded?.(result.assetId, {
      filename: result.originalFilename,
      sizeBytes: result.sizeBytes,
    });
  };

  return (
    <div className="upload-field">
      <label className="prog-field">
        <span className="prog-field-label">{label}</span>

        {state.kind === 'idle' || state.kind === 'error' ? (
          <input
            ref={inputRef}
            type="file"
            className="prog-input upload-field-input"
            accept={acceptAttr}
            onChange={handleChange}
            disabled={disabled}
          />
        ) : (
          <div className="upload-field-status">
            <span className="upload-field-filename">{state.kind === 'uploading' ? state.filename : state.filename}</span>
            <span className="upload-field-size">
              {formatSize(state.kind === 'uploading' ? state.sizeBytes : state.sizeBytes)}
            </span>
            {state.kind === 'uploading' ? (
              <span className="upload-field-progress">Uploading…</span>
            ) : (
              <>
                <span className="upload-field-progress upload-field-progress-done">Uploaded ✓</span>
                <button
                  type="button"
                  className="upload-field-clear"
                  onClick={reset}
                  aria-label="Remove file"
                  disabled={disabled}
                >
                  ×
                </button>
              </>
            )}
          </div>
        )}

        {hint ? <span className="prog-field-help">{hint}</span> : null}
        {state.kind === 'error' ? (
          <span className="prog-field-error">{state.message}</span>
        ) : null}
      </label>
    </div>
  );
}
