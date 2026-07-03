// mynclex/lib/authoring/block-upload-event.ts
//
// Bank-authoring mirror of lib/library/block-upload-event.ts (kept
// separate per the authoring tree's vendoring discipline — and so the
// library note editor's listener never picks up bank events).
//
// A window event any bank media block fires while a file upload is in
// flight. Editors that persist a draft (the narrative tab editor's
// Save) listen to this to refuse saving mid-upload — saving then would
// persist a not-yet-filled block. The matching `false` fires the
// moment the upload settles.

export const AUTH_BLOCK_UPLOAD_EVENT = 'auth-block-upload-state';

export interface AuthBlockUploadDetail {
  uploading: boolean;
}

/** Dispatch the shared upload-state event from a media block NodeView. */
export function emitAuthBlockUpload(uploading: boolean): void {
  window.dispatchEvent(
    new CustomEvent<AuthBlockUploadDetail>(AUTH_BLOCK_UPLOAD_EVENT, {
      detail: { uploading },
    }),
  );
}
