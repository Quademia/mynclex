// mynclex/lib/bank/atoms/editor-tabs.tsx
//
// Tab strip + panel switcher used inside an editor's left pane to
// avoid stacking Content / Classification / Housekeeping as a long
// vertical scroll.
//
// Behaviour
//   - Tab strip across the top, only the active tab's panel is
//     visible. Inactive panels stay in the DOM via the HTML `hidden`
//     attribute (= display:none) so their form fields still submit
//     when the curator clicks Save.
//   - Each tab can carry an `incomplete` flag — renders a small red
//     dot to flag missing required fields without forcing the curator
//     to switch tabs to discover the gap.
//   - An automatic "Next: <label> →" button appears at the bottom of
//     every panel except the last, so first-time curators can be
//     guided through the sequence without taking the freedom away
//     from experienced users (who can still click any tab directly).
//
// API
//   <EditorTabs tabs={[…]} active={state} onChange={setState}>
//     <TabPanel id="content">…</TabPanel>
//     <TabPanel id="classification">…</TabPanel>
//     <TabPanel id="housekeeping">…</TabPanel>
//   </EditorTabs>

'use client';

import { createContext, useContext } from 'react';

export interface EditorTab {
  /** Stable id, must match the corresponding <TabPanel id="…">. */
  id: string;
  /** Display label in the tab strip and the "Next" button. */
  label: string;
  /** Show a red-dot indicator when this tab has missing required fields. */
  incomplete?: boolean;
}

interface EditorTabsProps {
  tabs: EditorTab[];
  active: string;
  onChange: (id: string) => void;
  children: React.ReactNode;
}

interface TabsContextValue {
  active: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

export function EditorTabs({ tabs, active, onChange, children }: EditorTabsProps) {
  const activeIdx = tabs.findIndex((t) => t.id === active);
  const nextTab =
    activeIdx >= 0 && activeIdx < tabs.length - 1 ? tabs[activeIdx + 1] : null;

  return (
    <TabsContext.Provider value={{ active }}>
      <div className="auth-tabs">
        <div role="tablist" className="auth-tabs-strip" aria-label="Editor sections">
          {tabs.map((t) => {
            const isActive = active === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={isActive}
                aria-controls={`auth-tabpanel-${t.id}`}
                id={`auth-tab-${t.id}`}
                className={isActive ? 'auth-tab auth-tab--active' : 'auth-tab'}
                onClick={() => onChange(t.id)}
              >
                <span>{t.label}</span>
                {t.incomplete && (
                  <>
                    <span className="auth-tab-dot" aria-hidden="true" />
                    <span className="auth-sr-only">— required fields incomplete</span>
                  </>
                )}
              </button>
            );
          })}
        </div>

        <div className="auth-tabs-panels">{children}</div>

        {nextTab && (
          <div className="auth-tabs-next">
            <button
              type="button"
              className="auth-link-btn"
              onClick={() => onChange(nextTab.id)}
            >
              Next: {nextTab.label} →
            </button>
          </div>
        )}
      </div>
    </TabsContext.Provider>
  );
}

interface TabPanelProps {
  /** Must match a tab's id in the parent <EditorTabs>. */
  id: string;
  children: React.ReactNode;
}

export function TabPanel({ id, children }: TabPanelProps) {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error('TabPanel must be rendered inside <EditorTabs>.');
  }
  const isActive = ctx.active === id;
  return (
    <div
      role="tabpanel"
      id={`auth-tabpanel-${id}`}
      aria-labelledby={`auth-tab-${id}`}
      hidden={!isActive}
    >
      {children}
    </div>
  );
}
