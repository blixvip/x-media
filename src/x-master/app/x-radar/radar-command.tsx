"use client";

import { Command } from "cmdk";
import { useEffect } from "react";
import styles from "./x-radar.module.css";

export type RadarCommandItem = {
  id: string;
  group: "Navigate" | "Signals" | "Creators" | "Actions";
  label: string;
  detail?: string;
  keywords?: string[];
  onSelect: () => void;
};

type RadarCommandProps = {
  items: RadarCommandItem[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

const GROUPS: RadarCommandItem["group"][] = ["Navigate", "Signals", "Creators", "Actions"];

export function RadarCommand({ items, onOpenChange, open }: RadarCommandProps) {
  useEffect(() => {
    const openFromKeyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase("en-US") === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", openFromKeyboard);
    return () => document.removeEventListener("keydown", openFromKeyboard);
  }, [onOpenChange, open]);

  return (
    <Command.Dialog
      contentClassName={styles.commandDialog}
      label="Search X Radar"
      onOpenChange={onOpenChange}
      open={open}
      overlayClassName={styles.commandOverlay}
    >
      <div className={styles.commandInputRow}>
        <span aria-hidden="true">⌕</span>
        <Command.Input aria-label="Search X Radar" placeholder="Search signals, creators, or commands" />
        <kbd>Esc</kbd>
      </div>
      <Command.List className={styles.commandList}>
        <Command.Empty className={styles.commandEmpty}>No matching signal or command.</Command.Empty>
        {GROUPS.map((group) => {
          const groupItems = items.filter((item) => item.group === group);
          if (!groupItems.length) return null;
          return (
            <Command.Group className={styles.commandGroup} heading={group} key={group}>
              {groupItems.map((item) => (
                <Command.Item
                  className={styles.commandItem}
                  key={item.id}
                  keywords={item.keywords}
                  onSelect={() => {
                    item.onSelect();
                    onOpenChange(false);
                  }}
                  value={`${item.label} ${item.detail ?? ""}`}
                >
                  <span>{item.label}</span>
                  {item.detail && <small>{item.detail}</small>}
                </Command.Item>
              ))}
            </Command.Group>
          );
        })}
      </Command.List>
      <footer className={styles.commandFooter}>
        <span><kbd>↑↓</kbd> move</span>
        <span><kbd>↵</kbd> open</span>
      </footer>
    </Command.Dialog>
  );
}
