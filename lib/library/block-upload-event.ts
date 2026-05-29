// mynclex/lib/library/block-upload-event.ts
//
// Shared window event that any media block (Image — 11.6a, PDF —
// 11.6b, …) fires while a file upload is in flight. The note editor
// counts these to suppress autosave during an upload: uploading isn't
// inactivity, and saving mid-upload would persist a not-yet-filled
// block. The matching `false` fires the moment the upload settles,
// which lets the editor schedule the deferred save.
//
// Kept block-agnostic on purpose — both the image and PDF NodeViews
// dispatch the same event so the editor needs a single listener.

export const LIB_BLOCK_UPLOAD_EVENT = 'lib-block-upload-state';

export interface LibBlockUploadDetail {
  uploading: boolean;
}

/** Dispatch the shared upload-state event from a media block NodeView. */
export function emitBlockUpload(uploading: boolean): void {
  window.dispatchEvent(
    new CustomEvent<LibBlockUploadDetail>(LIB_BLOCK_UPLOAD_EVENT, {
      detail: { uploading },
    }),
  );
}
