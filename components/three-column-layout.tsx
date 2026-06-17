"use client";

import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

// NOTE: This used to wrap `react-resizable-panels` (v4), which silently fails
// to apply any size constraints under React 19.2 / Next 16 / Turbopack — panels
// fell back to content-based widths (left/right rails crushed to ~3%). Replaced
// with a self-contained flexbox + pointer-drag implementation so behaviour is
// deterministic and verifiable (measured 25/50/25 vs the library's 2.8/94.3/2.8).

const STORAGE_PREFIX = "nozero:three-col:";
const LAYOUT_VERSION = 4; // bump to invalidate stored widths from older builds

// All sizes are a percentage of the container's width.
const LEFT_MIN = 25;
const LEFT_MAX = 40;
const RIGHT_MIN = 25;
const RIGHT_MAX = 40;
const CENTER_MIN = 20;
const DEFAULT_LEFT = 25;
const DEFAULT_RIGHT = 25;

type StoredLayout = {
  left: number;
  right: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
};

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

function readStored(layoutId: string): StoredLayout | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const versionKey = `${STORAGE_PREFIX}version`;
    if (window.localStorage.getItem(versionKey) !== String(LAYOUT_VERSION)) {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith(STORAGE_PREFIX) && key !== versionKey) {
          window.localStorage.removeItem(key);
        }
      }
      window.localStorage.setItem(versionKey, String(LAYOUT_VERSION));
      return null;
    }
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${layoutId}`);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredLayout>;
    if (typeof parsed.left !== "number" || typeof parsed.right !== "number") {
      return null;
    }
    return {
      left: clamp(parsed.left, LEFT_MIN, LEFT_MAX),
      right: clamp(parsed.right, RIGHT_MIN, RIGHT_MAX),
      leftCollapsed: Boolean(parsed.leftCollapsed),
      rightCollapsed: Boolean(parsed.rightCollapsed),
    };
  } catch {
    return null;
  }
}

function writeStored(layoutId: string, layout: StoredLayout) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${layoutId}`,
      JSON.stringify(layout),
    );
  } catch {
    // ignore quota errors
  }
}

type ThreeColumnLayoutProps = {
  layoutId: string;
  left: ReactNode;
  center: ReactNode;
  right: ReactNode;
  className?: string;
};

const TOGGLE_BTN =
  "absolute top-2 z-20 rounded-md p-1 text-ink-subtle opacity-0 transition hover:bg-accent hover:text-ink group-hover:opacity-100 focus-visible:opacity-100";
const TOGGLE_BTN_FLOAT =
  "absolute top-2 z-20 rounded-md border border-line bg-surface/80 p-1 text-ink-muted backdrop-blur transition-colors hover:bg-accent hover:text-ink";

export function ThreeColumnLayout({
  layoutId,
  left,
  center,
  right,
  className,
}: ThreeColumnLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [leftPct, setLeftPct] = useState(DEFAULT_LEFT);
  const [rightPct, setRightPct] = useState(DEFAULT_RIGHT);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [dragging, setDragging] = useState(false);

  // Live refs so the global pointer listeners never read stale state.
  const leftPctRef = useRef(leftPct);
  const rightPctRef = useRef(rightPct);
  const leftColRef = useRef(leftCollapsed);
  const rightColRef = useRef(rightCollapsed);
  leftPctRef.current = leftPct;
  rightPctRef.current = rightPct;
  leftColRef.current = leftCollapsed;
  rightColRef.current = rightCollapsed;

  const dragRef = useRef<{
    side: "left" | "right";
    startX: number;
    startPct: number;
    width: number;
  } | null>(null);

  // Hydrate from storage after mount. First client render matches SSR
  // (defaults), so there is no hydration mismatch.
  useEffect(() => {
    const stored = readStored(layoutId);
    if (stored) {
      setLeftPct(stored.left);
      setRightPct(stored.right);
      setLeftCollapsed(stored.leftCollapsed);
      setRightCollapsed(stored.rightCollapsed);
    }
    setHydrated(true);
  }, [layoutId]);

  const persist = useCallback(
    (override?: Partial<StoredLayout>) => {
      writeStored(layoutId, {
        left: leftPctRef.current,
        right: rightPctRef.current,
        leftCollapsed: leftColRef.current,
        rightCollapsed: rightColRef.current,
        ...override,
      });
    },
    [layoutId],
  );

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    const deltaPct = ((event.clientX - drag.startX) / drag.width) * 100;
    if (drag.side === "left") {
      const otherRight = rightColRef.current ? 0 : rightPctRef.current;
      const maxByCenter = 100 - otherRight - CENTER_MIN;
      setLeftPct(
        clamp(drag.startPct + deltaPct, LEFT_MIN, Math.min(LEFT_MAX, maxByCenter)),
      );
    } else {
      const otherLeft = leftColRef.current ? 0 : leftPctRef.current;
      const maxByCenter = 100 - otherLeft - CENTER_MIN;
      setRightPct(
        clamp(
          drag.startPct - deltaPct,
          RIGHT_MIN,
          Math.min(RIGHT_MAX, maxByCenter),
        ),
      );
    }
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!dragRef.current) {
      return;
    }
    dragRef.current = null;
    setDragging(false);
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    persist();
  }, [handlePointerMove, persist]);

  const startDrag = useCallback(
    (side: "left" | "right", event: ReactPointerEvent) => {
      event.preventDefault();
      const width = containerRef.current?.getBoundingClientRect().width ?? 1;
      dragRef.current = {
        side,
        startX: event.clientX,
        startPct: side === "left" ? leftPctRef.current : rightPctRef.current,
        width,
      };
      setDragging(true);
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [handlePointerMove, handlePointerUp],
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const toggleLeft = useCallback(() => {
    setLeftCollapsed((prev) => {
      const next = !prev;
      leftColRef.current = next;
      persist({ leftCollapsed: next });
      return next;
    });
  }, [persist]);

  const toggleRight = useCallback(() => {
    setRightCollapsed((prev) => {
      const next = !prev;
      rightColRef.current = next;
      persist({ rightCollapsed: next });
      return next;
    });
  }, [persist]);

  const transition = hydrated && !dragging ? "transition-[flex-basis] duration-150" : "";

  return (
    <div
      className={cn("flex h-full min-h-0 w-full min-w-0 bg-col-shell", className)}
      ref={containerRef}
    >
      {/* Left rail */}
      <div
        className={cn(
          "group relative flex min-h-0 shrink-0 grow-0 flex-col overflow-hidden bg-col-side",
          transition,
          leftCollapsed && "pointer-events-none",
        )}
        style={{ flexBasis: leftCollapsed ? "0%" : `${leftPct}%` }}
      >
        {!leftCollapsed && (
          <button
            aria-label="Hide left panel"
            className={cn(TOGGLE_BTN, "right-1.5")}
            onClick={toggleLeft}
            type="button"
          >
            <PanelLeftCloseIcon className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {left}
        </div>
      </div>

      {/* Left divider */}
      {!leftCollapsed && (
        <div
          aria-orientation="vertical"
          className="group relative z-10 w-px shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-active/40"
          onPointerDown={(e) => startDrag("left", e)}
          role="separator"
        >
          <span className="absolute inset-y-0 -left-1.5 -right-1.5 block" />
        </div>
      )}

      {/* Center */}
      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-col-center">
        {leftCollapsed && (
          <button
            aria-label="Show left panel"
            className={cn(TOGGLE_BTN_FLOAT, "left-1.5")}
            onClick={toggleLeft}
            type="button"
          >
            <PanelLeftOpenIcon className="h-3.5 w-3.5" />
          </button>
        )}
        {rightCollapsed && (
          <button
            aria-label="Show right panel"
            className={cn(TOGGLE_BTN_FLOAT, "right-1.5")}
            onClick={toggleRight}
            type="button"
          >
            <PanelRightOpenIcon className="h-3.5 w-3.5" />
          </button>
        )}
        {center}
      </div>

      {/* Right divider */}
      {!rightCollapsed && (
        <div
          aria-orientation="vertical"
          className="group relative z-10 w-px shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-active/40"
          onPointerDown={(e) => startDrag("right", e)}
          role="separator"
        >
          <span className="absolute inset-y-0 -left-1.5 -right-1.5 block" />
        </div>
      )}

      {/* Right rail */}
      <div
        className={cn(
          "group relative flex min-h-0 shrink-0 grow-0 flex-col overflow-hidden bg-col-side",
          transition,
          rightCollapsed && "pointer-events-none",
        )}
        style={{ flexBasis: rightCollapsed ? "0%" : `${rightPct}%` }}
      >
        {!rightCollapsed && (
          <button
            aria-label="Hide right panel"
            className={cn(TOGGLE_BTN, "left-1.5")}
            onClick={toggleRight}
            type="button"
          >
            <PanelRightCloseIcon className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {right}
        </div>
      </div>
    </div>
  );
}
