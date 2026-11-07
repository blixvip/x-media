"use client";

import type { RadarView } from "../../lib/x-radar-view";
import styles from "./apple-workspace.module.css";

export type WorkspaceNavItem = { id: RadarView; label: string; count?: number };
const PRIMARY: RadarView[] = ["posts", "trending", "saved", "drafts"];

export function WorkspaceNavigation({ items, active, choose }: { items: WorkspaceNavItem[]; active: RadarView; choose: (view: RadarView) => void }) {
  return <nav aria-label="Main navigation" className={styles.simpleNavigation}>
    {PRIMARY.map(id => <button key={id} type="button" aria-current={active === id ? "page" : undefined} onClick={() => choose(id)}>{items.find(item => item.id === id)?.label}</button>)}
  </nav>;
}
