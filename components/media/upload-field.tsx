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

import { useEffect, useRef, useState } from 'react';

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
  /**
   * Called with `true` when an upload (including any pre-upload
   * transform) begins and `false` when it finishes — whether it
   * succeeded, errored, or was rejected client-side. Lets a parent
   * treat "upload in flight" as not-idle — e.g. the library editor
   * suppresses autosave while an image is still uploading.
   */
  onUploadingChange?: (uploading: boolean) => void;
  /** Optional helper text shown under the picker — e.g. "PDF only. Word → File → Export → PDF." */
  hint?: string;
  /** Label above the picker. Defaults to "File". */
  label?: string;
  disabled?: boolean;
  /**
   * Optional pre-upload transform applied to the picked file before
   * it's validated for size and sent to the server — e.g. the image
   * resize helper. Type validation runs on the original (a transform
   * preserves MIME type); size validation runs on the result so a
   * large original that shrinks under the cap is accepted.
   */
  transform?: (file: File) => Promise<File>;
}


function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


export function UploadField({
  purpose,
  onUploaded,
  onUploadingChange,
  hint,
  label = 'File',
  disabled = false,
  transform,
}: UploadFieldProps) {
  const config = PURPOSE_CONFIG[purpose];
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UploadState>({ kind: 'idle' });

  // Whether we've told the parent an upload is in flight. Used so the
  // matching `false` is emitted exactly once, on whichever exit path
  // ends the upload — and never left dangling if this component
  // unmounts mid-upload (the image block swaps the dropzone for the
  // filled view the instant the assetId lands). A dangling `true`
  // would leave a parent's in-flight counter stuck and, in the
  // library editor, suppress autosave forever.
  const uploadingSignalledRef = useRef(false);
  const emitUploading = (next: boolean) => {
    if (uploadingSignalledRef.current === next) return;
    uploadingSignalledRef.current = next;
    onUploadingChange?.(next);
  };
  useEffect(() => {
    return () => {
      if (uploadingSignalledRef.current) {
        uploadingSignalledRef.current = false;
        onUploadingChange?.(false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    // Show progress immediately — a transform (e.g. image resize) can
    // take a beat on a large file.
    setState({ kind: 'uploading', filename: file.name, sizeBytes: file.size });
    emitUploading(true);

    let toUpload = file;
    if (transform) {
      try {
        toUpload = await transform(file);
      } catch {
        setState({ kind: 'error', message: 'Could not process the file. Please try a different one.' });
        emitUploading(false);
        return;
      }
    }

    // Size is checked on the file we'll actually upload — after any
    // transform — so a large original that shrinks under the cap is
    // accepted.
    if (toUpload.size > config.maxSizeBytes) {
      setState({ kind: 'error', message: `File is too large. Max ${maxMb} MB.` });
      emitUploading(false);
      return;
    }

    setState({ kind: 'uploading', filename: toUpload.name, sizeBytes: toUpload.size });

    let result;
    try {
      result = await uploadAssetAction(toUpload, purpose);
    } catch (err) {
      // A server action that throws (rather than returning {ok:false})
      // rejects this await. Without this catch the UI would hang on
      // "Uploading…" forever. Surface it instead.
      console.error('uploadAssetAction threw', err);
      setState({
        kind: 'error',
        message:
          err instanceof Error
            ? `Upload failed: ${err.message}`
            : 'Upload failed unexpectedly. Please try again.',
      });
      emitUploading(false);
      return;
    }
    if (!result.ok) {
      setState({ kind: 'error', message: result.error });
      emitUploading(false);
      return;
    }

    setState({
      kind: 'done',
      assetId: result.assetId,
      filename: result.originalFilename,
      sizeBytes: result.sizeBytes,
    });
    // Signal "no longer uploading" *before* handing the assetId up —
    // onUploaded may unmount this field (the image block swaps to its
    // filled view), so emit while we're still mounted.
    emitUploading(false);
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
