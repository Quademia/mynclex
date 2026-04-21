// mynclex/app/(app)/admin/bank/form.tsx
//
// Thin dispatcher — page.tsx imports `BankForm` from here; the actual
// frame + per-type editor split lives in editor-shell.tsx + the
// lib/bank/editors/ components. Keeping this file as a small indirection
// lets the server page import a stable module path even if the shell
// file name or signature evolves.

'use client';

import { EditorShell } from './editor-shell';
import type { BankFormInitial } from '@/lib/bank/form-shape';

export function BankForm({
  initial,
  savedFlash,
}: {
  initial: BankFormInitial;
  savedFlash: boolean;
}) {
  return <EditorShell initial={initial} savedFlash={savedFlash} />;
}
