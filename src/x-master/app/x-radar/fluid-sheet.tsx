"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type PointerEvent, type ReactElement, type ReactNode } from "react";
import styles from "./apple-workspace.module.css";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
  title: string;
  description: string;
  children: ReactNode;
  onCloseAutoFocus?: (event: Event) => void;
};

export function FluidSheet({ open, onOpenChange, trigger, title, description, children, onCloseAutoFocus }: Props) {
  const [present, setPresent] = useState(open);
  const reduced = useReducedMotion();
  const position = useMotionValue(0);
  const opacity = useMotionValue(0);
  const panel = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const targetOpen = useRef(open);
  const releaseVelocity = useRef(0);
  const drag = useRef<{ id: number; start: number; offset: number; moved: boolean; samples: { value: number; time: number }[] } | null>(null);
  const [mobile, setMobile] = useState(true);

  useEffect(() => {
    const query = matchMedia("(max-width: 1023px)");
    const update = () => setMobile(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    targetOpen.current = open;
    if (open && !present) {
      // Retain Radix focus and modality until an interrupted exit actually settles.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPresent(true);
      return;
    }
    if (!present) return;
    if (drag.current) return;
    const distance = mobile ? (panel.current?.offsetHeight ?? 700) : (panel.current?.offsetWidth ?? 480);
    if (!started.current) { position.set(reduced ? 0 : distance); started.current = true; }
    const movement = animate(position, reduced ? 0 : open ? 0 : distance, { type: "spring", stiffness: 430, damping: 42, velocity: releaseVelocity.current || position.getVelocity() });
    releaseVelocity.current = 0;
    const fade = animate(opacity, open ? 1 : 0, { duration: reduced ? .1 : .16 });
    void Promise.all([movement, fade]).then(() => {
      if (!targetOpen.current) { setPresent(false); started.current = false; }
    });
    return () => { movement.stop(); fade.stop(); };
  }, [open, present, mobile, reduced, position, opacity]);

  function grab(event: PointerEvent<HTMLDivElement>) {
    if (!mobile || event.button !== 0) return;
    position.stop(); opacity.stop(); opacity.set(1);
    targetOpen.current = true;
    onOpenChange(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, start: event.clientY, offset: position.get(), moved: false, samples: [{ value: event.clientY, time: performance.now() }] };
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    const delta = event.clientY - state.start;
    if (!state.moved && Math.abs(delta) < 10) return;
    state.moved = true;
    // A grab cancels any retarget started by the controlled-open update.
    position.stop();
    const next = state.offset + delta;
    position.set(next >= 0 ? next : next * 120 / (120 + Math.abs(next)));
    const now = performance.now();
    state.samples = [...state.samples.filter((sample) => now - sample.time < 100), { value: event.clientY, time: now }];
  }

  function release(event: PointerEvent<HTMLDivElement>, cancel = false) {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    drag.current = null;
    const first = state.samples[0];
    const last = state.samples[state.samples.length - 1];
    const velocity = !cancel && state.moved && performance.now() - last.time < 100 && last.time > first.time
      ? (last.value - first.value) / (last.time - first.time) * 1000 : 0;
    const height = panel.current?.offsetHeight ?? 700;
    const projected = position.get() + velocity / 1000 * .998 / (1 - .998);
    if (!cancel && projected > height * .4) {
      releaseVelocity.current = velocity;
      onOpenChange(false);
    } else {
      animate(position, 0, reduced ? { duration: 0 } : { type: "spring", stiffness: 430, damping: 42, velocity });
    }
  }

  return <Dialog.Root open={present} onOpenChange={onOpenChange}>
    <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
    {present && <Dialog.Portal>
      <Dialog.Overlay asChild><motion.div className={styles.scrim} style={{ opacity }} /></Dialog.Overlay>
      <Dialog.Content asChild onCloseAutoFocus={onCloseAutoFocus}>
        <motion.div ref={panel} className={`x-master-theme ${styles.sheet}`} style={{ x: mobile ? 0 : position, y: mobile ? position : 0, opacity }}>
          <div className={styles.dragHandle} onPointerDown={grab} onPointerMove={move} onPointerUp={(event) => release(event)} onPointerCancel={(event) => release(event, true)} onLostPointerCapture={(event) => release(event, true)} aria-hidden="true"><i /></div>
          <header className={styles.sheetHeader}><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div><Dialog.Close aria-label={`Close ${title.toLowerCase()}`}>×</Dialog.Close></header>
          <div className={styles.sheetBody}>{children}</div>
        </motion.div>
      </Dialog.Content>
    </Dialog.Portal>}
  </Dialog.Root>;
}
