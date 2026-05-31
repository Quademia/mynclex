// mynclex/lib/library/tag-rows.tsx
//
// The Tags lens body (slice 11.16b-1). One row per distinct tag in
// the tutor's library, with a usage count, linking to the `?tag=`
// filter scope. Replaces the static "Tags from your notes appear
// here" placeholder.

import Link from 'next/link';
import type { LibraryTagCount } from './types';

export function TagRows({
  tags,
  selected,
}: {
  tags: LibraryTagCount[];
  selected: string | null;
}) {
  if (tags.length === 0) {
    return (
      <div className="lens-empty">
        Tags you add to notes appear here. Add them from a note&apos;s
        editor.
      </div>
    );
  }

  return (
    <div className="lens-tag-list">
      {tags.map(({ tag, count }) => {
        const isActive = selected === tag;
        return (
          <Link
            key={tag}
            href={`/tutor/library?tag=${encodeURIComponent(tag)}`}
            className={`lens-item lens-item-tag${isActive ? ' is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="label">
              <span className="lens-tag-hash" aria-hidden="true">
                #
              </span>
              {tag}
            </span>
            <span className="cnt">{count}</span>
          </Link>
        );
      })}
    </div>
  );
}
