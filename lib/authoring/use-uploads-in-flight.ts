'use client';

// mynclex/lib/authoring/use-uploads-in-flight.ts
//
// Bank rich-content Slice 8 — shared save-safety hook.
//
// True while any bank media block (the `bankImage` NodeView) has a file
// upload in flight — it fires AUTH_BLOCK_UPLOAD_EVENT true/false around
// each one. Question editors gate their submit on this: saving mid-upload
// would persist a not-yet-filled block (the doc serialises with
// assetId: null) and the image would silently be absent. The narrative
// tab editor carries the same guard inline (Slice 7); this hook is the
// reusable form for the many question editors.

import { useEffect, useState } from 'react';
import {
  AUTH_BLOCK_UPLOAD_EVENT,
  type AuthBlockUploadDetail,
} from './block-upload-event';

export function useAuthUploadsInFlight(): boolean {
  const [inFlight, setInFlight] = useState(0);

  useEffect(() => {
    function onUpload(e: Event) {
      const { uploading } = (e as CustomEvent<AuthBlockUploadDetail>).detail;
      setInFlight((n) => Math.max(0, n + (uploading ? 1 : -1)));
    }
    window.addEventListener(AUTH_BLOCK_UPLOAD_EVENT, onUpload);
    return () => window.removeEventListener(AUTH_BLOCK_UPLOAD_EVENT, onUpload);
  }, []);

  return inFlight > 0;
}
