// mynclex/lib/curriculum/pdf-editor.tsx
//
// PDF-activity editor body. Two visual states gated by whether the
// body holds a pdf_asset_id:
//
//   • No PDF attached → renders <UploadField purpose="PDF_ACTIVITY">.
//     The tutor picks a file; auto-upload fires; on completion the
//     onUploaded callback bubbles the new asset_id up to the modal,
//     which stores it in the discriminated body state.
//
//   • PDF attached → renders a file-row card with filename, size,
//     "Preview ↗" link (signed URL, new tab), and a "Replace"
//     button that clears the attachment and brings the picker back.
//     Estimated-time input sits below in both states.
//
// The component is stateless about *which* asset is current — that
// lives in the parent modal's discriminated body state. The modal
// is responsible for fetching preview metadata (filename / size /
// signed URL) for any attached asset and passing it as `preview`.
// While preview is loading the file-row shows a minimal placeholder.

'use client';

import { UploadField } from '@/components/media/upload-field';
import type {
  PdfActivityBodyValues,
  PdfActivityPreview,
} from './types';

interface PdfEditorProps {
  values: PdfActivityBodyValues;
  onChange: (next: PdfActivityBodyValues) => void;
  // Display metadata for the currently-attached asset, if any. The
  // modal sets this whenever pdf_asset_id changes (initial load in
  // edit mode, after fresh upload). Null while loading or with no
  // attachment.
  preview: PdfActivityPreview | null;
  onUploaded: (assetId: string) => void;
  onClearAsset: () => void;
  disabled?: boolean;
}


function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


export function PdfEditor({
  values,
  onChange,
  preview,
  onUploaded,
  onClearAsset,
  disabled = false,
}: PdfEditorProps) {
  const hasAsset = values.pdf_asset_id !== null;

  return (
    <div className="activity-editor-body">
      <label className="prog-field">
        <span className="prog-field-label">
          PDF file <span className="prog-required">*</span>
        </span>

        {hasAsset ? (
          preview ? (
            <div className="pdf-editor-file-row">
              <span className="pdf-editor-file-icon" aria-hidden="true">
                📄
              </span>
              <span className="pdf-editor-file-name">
                {preview.original_filename}
              </span>
              <span className="pdf-editor-file-size">
                {formatSize(preview.size_bytes)}
              </span>
              <div className="pdf-editor-file-actions">
                <a
                  className="pdf-editor-preview-link"
                  href={preview.signed_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Preview ↗
                </a>
                <button
                  type="button"
                  className="pdf-editor-replace-btn"
                  onClick={onClearAsset}
                  disabled={disabled}
                >
                  Replace
                </button>
              </div>
            </div>
          ) : (
            <div className="pdf-editor-file-row pdf-editor-file-row-loading">
              Loading file details…
            </div>
          )
        ) : (
          <UploadField
            purpose="PDF_ACTIVITY"
            hint="PDF only, max 25 MB. In Word: File → Export → PDF."
            label=""
            disabled={disabled}
            onUploaded={(assetId) => onUploaded(assetId)}
          />
        )}
      </label>

      <label className="prog-field">
        <span className="prog-field-label">Estimated reading time</span>
        <div className="activity-text-minutes-row">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            className="prog-input activity-text-minutes"
            value={values.estimated_minutes}
            onChange={(e) =>
              onChange({ ...values, estimated_minutes: e.target.value })
            }
            disabled={disabled}
            placeholder="—"
          />
          <span className="activity-text-minutes-suffix">minutes</span>
        </div>
        <span className="prog-field-help">Optional. Shown on the student card.</span>
      </label>
    </div>
  );
}
