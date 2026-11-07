"use client";

import { type ReactElement, type ReactNode } from "react";
import { FluidSheet } from "./fluid-sheet";

type RadarSettingsSheetProps = {
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  trigger: ReactElement;
};

export function RadarSettingsSheet({ children, onOpenChange, open, trigger }: RadarSettingsSheetProps) {
  return (
    <FluidSheet onOpenChange={onOpenChange} open={open} trigger={trigger} title="Settings" description="Sources, your account, and notifications.">{children}</FluidSheet>
  );
}
