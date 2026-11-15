"use client";

// Keeps a block in view while the page scrolls past the charts it belongs to. The page scrolls
// inside <main>, and the list sits in a box with its own overflow, so CSS `position: sticky` has
// nothing to stick to. The block is moved with a transform instead, inside `area` only: it never
// leaves the area it controls and moves back with it. No layout changes, no state, no re-render.
import { useEffect, type RefObject } from "react";

/** The offset of a block that stays `gap` px under the top of `scroller`, clamped to its area. Pure, for tests. */
export function pinOffset(blockTop: number, blockHeight: number, areaBottom: number, scrollerTop: number, gap: number): number {
  const max = Math.max(0, areaBottom - (blockTop + blockHeight));
  return Math.min(max, Math.max(0, scrollerTop + gap - blockTop));
}

/** Moves a block down by `shift` px (0 puts it back). A DOM write, kept out of render. */
function moveBlock(el: HTMLElement, shift: number) {
  el.style.transform = shift > 0 ? `translateY(${shift}px)` : "";
  el.dataset.pinned = shift > 0 ? "true" : "false";
}

/** When the block spans the whole area (one column, or a full-width player) the area gets room below equal to the block's height, so at the end of the scroll the block rests under the last chart and its notes instead of covering them. */
function reserveRoom(box: HTMLElement, width: number, height: number) {
  box.style.paddingBottom = height > 0 && width >= box.clientWidth * 0.9 ? `${height}px` : "";
}

export function usePinned(block: RefObject<HTMLElement | null>, area: RefObject<HTMLElement | null>, gap = 8) {
  useEffect(() => {
    const el = block.current;
    const box = area.current;
    if (!el || !box) return;
    const scroller = el.closest("main");
    const state = { shift: 0 };
    const apply = () => {
      const rect = el.getBoundingClientRect();
      reserveRoom(box, rect.width, rect.height);
      const next = pinOffset(rect.top - state.shift, rect.height, box.getBoundingClientRect().bottom, scroller ? scroller.getBoundingClientRect().top : 0, gap);
      if (Math.abs(next - state.shift) < 0.5) return;
      state.shift = next;
      moveBlock(el, next);
    };
    const target: EventTarget = scroller ?? window;
    let frame = 0;
    const onScroll = () => {
      if (frame === 0) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          apply();
        });
      }
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", apply);
    const observer = new ResizeObserver(apply);
    observer.observe(box);
    observer.observe(el);
    apply();
    return () => {
      target.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", apply);
      observer.disconnect();
      moveBlock(el, 0);
      reserveRoom(box, 0, 0);
    };
  }, [block, area, gap]);
}
