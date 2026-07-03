import { describe, it, expect } from 'vitest';
import {
  collectBankImageAssetIds,
  docHasFilledBankImage,
  richTextToPlainLabel,
} from './bank-image-doc';
import { parseRichDoc } from './rich-doc';
import { isNarrativeEmpty, type NarrativeTabData } from './narrative/narrative-model';

// Doc fragments
const imgNode = (assetId: string | null) => ({
  type: 'bankImage',
  attrs: { assetId, alt: 'an ECG', caption: '' },
});
const para = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});
const doc = (...content: unknown[]) => ({ type: 'doc', content });

describe('collectBankImageAssetIds', () => {
  it('finds ids in a plain doc, skipping never-filled blocks', () => {
    const d = doc(para('before'), imgNode('a-1'), imgNode(null), imgNode('a-2'));
    expect([...collectBankImageAssetIds(d)].sort()).toEqual(['a-1', 'a-2']);
  });

  it('finds ids nested inside a frozen attempt tab snapshot (the 7c gate shape)', () => {
    // Mirrors tabs_snapshot_json: an array of tab rows whose `entries`
    // is the v2 narrative object, each entry body a rich doc. Note the
    // nesting goes through non-`content` keys (entries → body).
    const tabsSnapshot = [
      {
        tab_key: 'nurses_notes',
        title: 'Nurses’ Notes',
        entries: {
          v: 2,
          entries: [
            { id: 'e0', visibleFrom: 1, chips: ['0900'], body: doc(para('obs'), imgNode('snap-1')) },
            { id: 'e1', visibleFrom: 2, chips: [], body: doc(imgNode('snap-2')) },
          ],
        },
      },
      { tab_key: 'vital_signs', title: 'Vitals', entries: { v: 2, tables: [] } },
    ];
    expect([...collectBankImageAssetIds(tabsSnapshot)].sort()).toEqual([
      'snap-1',
      'snap-2',
    ]);
  });

  it('accumulates into a provided set and tolerates malformed input', () => {
    const into = new Set<string>(['pre']);
    collectBankImageAssetIds(doc(imgNode('x')), into);
    collectBankImageAssetIds(null, into);
    collectBankImageAssetIds('not json-ish', into);
    collectBankImageAssetIds(42, into);
    expect([...into].sort()).toEqual(['pre', 'x']);
  });

  it('finds ids in a frozen STEM snapshot (the Slice-8 gate shape)', () => {
    // stem_snapshot is a TEXT column: rich stems arrive as a stringified
    // Tiptap doc, legacy stems as plain prose. The 8b gate composes
    // parseRichDoc → collect; a plain-text stem must yield nothing, and
    // the raw string itself must never be walked as if it were a doc.
    const richStem = JSON.stringify(
      doc(para('Interpret the rhythm strip. {1}'), imgNode('stem-1')),
    );
    expect([...collectBankImageAssetIds(parseRichDoc(richStem))]).toEqual(['stem-1']);
    expect(collectBankImageAssetIds(parseRichDoc('plain legacy stem')).size).toBe(0);
    expect(collectBankImageAssetIds(richStem).size).toBe(0); // unparsed string finds nothing
  });

  it('ignores other node types and non-string asset ids', () => {
    const d = doc(
      { type: 'libImage', attrs: { assetId: 'library-not-bank' } },
      { type: 'bankImage', attrs: { assetId: 7 } },
      { type: 'bankImage' },
    );
    expect(collectBankImageAssetIds(d).size).toBe(0);
  });
});

describe('docHasFilledBankImage', () => {
  it('true only when a filled bankImage exists', () => {
    expect(docHasFilledBankImage(doc(para('text only')))).toBe(false);
    expect(docHasFilledBankImage(doc(imgNode(null)))).toBe(false);
    expect(docHasFilledBankImage(doc(imgNode('a')))).toBe(true);
  });
});

describe('richTextToPlainLabel', () => {
  it('flattens text, labels image-only docs, stays empty otherwise', () => {
    const withText = JSON.stringify(doc(para('Assess the client.'), imgNode('a')));
    const imageOnly = JSON.stringify(doc(imgNode('a')));
    expect(richTextToPlainLabel(withText)).toBe('Assess the client.');
    expect(richTextToPlainLabel(imageOnly)).toBe('(image)');
    expect(richTextToPlainLabel('')).toBe('');
    expect(richTextToPlainLabel(null)).toBe('');
  });
});

describe('image-only narrative entry counts as content', () => {
  it('isNarrativeEmpty is false for a chip-less, text-less entry holding an image', () => {
    const tab: NarrativeTabData = {
      v: 2,
      entries: [
        {
          id: 'e0',
          visibleFrom: 1,
          chips: [],
          body: doc(imgNode('a-1')) as NarrativeTabData['entries'][number]['body'],
        },
      ],
    };
    expect(isNarrativeEmpty(tab)).toBe(false);
  });
});
