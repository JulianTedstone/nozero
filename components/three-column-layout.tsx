"use client";

import {
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  Group,
  type Layout,
  Panel,
  Separator,
  usePanelRef,
} from "react-resizable-panels";
import { cn } from "@/lib/utils";

const STORAGE_PREFIX = "nozero:three-col:";

const DEFAULT_LAYOUT: Layout = {
  left: 25,
  center: 50,
  right: 25,
};

const LAYOUT_VERSION = 2; // bump when constraints change to force reset

function readStoredLayout(layoutId: string): Layout | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
    const versionKey = `${STORAGE_PREFIX}version`;
    const stored = window.localStorage.getItem(versionKey);
    if (stored !== String(LAYOUT_VERSION)) {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${layoutId}`);
      window.localStorage.setItem(versionKey, String(LAYOUT_VERSION));
      return undefined;
    }
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${layoutId}`);
    if (!raw) {
      return undefined;
    }
    const parsed = JSON.parse(raw) as Layout;
    if (
      typeof parsed.left === "number" &&
      typeof parsed.center === "number" &&
      typeof parsed.right === "number"
    ) {
      const center = parsed.center;
      const left = parsed.left;
      const right = parsed.right;
      if (
        center > 70 ||
        center < 20 ||
        left < 25 ||
        right < 25 ||
        left + right + center < 99 ||
        left + right + center > 101
      ) {
        return DEFAULT_LAYOUT;
      }
      return parsed;
    }
  } catch {
    // ignore corrupt layout
  }
  return undefined;
}

function writeStoredLayout(layoutId: string, layout: Layout) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      `${STORAGE_PREFIX}${layoutId}`,
      JSON.stringify(layout)
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

function isPanelCollapsed(size: number | undefined): boolean {
  return (size ?? 0) < 1;
}

function syncCollapsedFromLayout(
  layout: Layout,
  setLeft: (v: boolean) => void,
  setRight: (v: boolean) => void,
) {
  setLeft(isPanelCollapsed(layout.left));
  setRight(isPanelCollapsed(layout.right));
}

export function ThreeColumnLayout({
  layoutId,
  left,
  center,
  right,
  className,
}: ThreeColumnLayoutProps) {
  const leftPanelRef = usePanelRef();
  const rightPanelRef = usePanelRef();
  const [defaultLayout] = useState<Layout>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_LAYOUT;
    }
    return readStoredLayout(layoutId) ?? DEFAULT_LAYOUT;
  });
  const [leftCollapsed, setLeftCollapsed] = useState(() =>
    isPanelCollapsed(defaultLayout.left),
  );
  const [rightCollapsed, setRightCollapsed] = useState(() =>
    isPanelCollapsed(defaultLayout.right),
  );

  useEffect(() => {
    syncCollapsedFromLayout(
      defaultLayout,
      setLeftCollapsed,
      setRightCollapsed,
    );
    const frame = requestAnimationFrame(() => {
      const leftPanel = leftPanelRef.current;
      const rightPanel = rightPanelRef.current;
      let resetLayout = false;
      if (leftPanel?.isCollapsed()) {
        leftPanel.expand();
        resetLayout = true;
      }
      if (rightPanel?.isCollapsed()) {
        rightPanel.expand();
        resetLayout = true;
      }
      if (resetLayout) {
        writeStoredLayout(layoutId, DEFAULT_LAYOUT);
      }
      setLeftCollapsed(leftPanel?.isCollapsed() ?? false);
      setRightCollapsed(rightPanel?.isCollapsed() ?? false);
    });
    return () => cancelAnimationFrame(frame);
  }, [defaultLayout, layoutId, leftPanelRef, rightPanelRef]);

  const handleLayoutChanged = useCallback(
    (layout: Layout) => {
      const left = layout.left ?? 0;
      const right = layout.right ?? 0;
      const center = layout.center ?? 0;
      syncCollapsedFromLayout(layout, setLeftCollapsed, setRightCollapsed);
      if (left < 1 || right < 1) {
        return;
      }
      const normalized: Layout =
        left < 25 || right < 25 || center > 70
          ? DEFAULT_LAYOUT
          : {
              left: Math.max(left, 25),
              center: Math.min(Math.max(center, 20), 50),
              right: Math.max(right, 25),
            };
      writeStoredLayout(layoutId, normalized);
    },
    [layoutId],
  );

  const toggleLeft = useCallback(() => {
    const panel = leftPanelRef.current;
    if (!panel) {
      return;
    }
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [leftPanelRef]);

  const toggleRight = useCallback(() => {
    const panel = rightPanelRef.current;
    if (!panel) {
      return;
    }
    if (panel.isCollapsed()) {
      panel.expand();
    } else {
      panel.collapse();
    }
  }, [rightPanelRef]);

  return (
    <Group
      className={cn("flex h-full min-h-0 w-full min-w-0 flex-1", className)}
      defaultLayout={defaultLayout}
      id={layoutId}
      onLayoutChanged={handleLayoutChanged}
      orientation="horizontal"
    >
      <Panel
        className="relative flex min-h-0 min-w-0 flex-col overflow-hidden"
        collapsedSize={0}
        collapsible
        defaultSize={25}
        id="left"
        maxSize={40}
        minSize={25}
        onResize={() => {
          setLeftCollapsed(leftPanelRef.current?.isCollapsed() ?? false);
        }}
        panelRef={leftPanelRef}
      >
        {!leftCollapsed ? (
          <button
            aria-label="Hide left panel"
            className="absolute top-2 right-1.5 z-10 rounded-md p-1 text-white/35 hover:bg-white/[0.06] hover:text-white/60"
            onClick={toggleLeft}
            type="button"
          >
            <PanelLeftCloseIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {left}
        </div>
      </Panel>

      <Separator className="w-px bg-white/[0.06] transition-colors hover:bg-white/[0.12]" />

      <Panel
        className="relative flex min-h-0 min-w-0 flex-col overflow-hidden"
        id="center"
        minSize={20}
      >
        {leftCollapsed ? (
          <button
            aria-label="Show left panel"
            className="absolute top-2 left-1.5 z-10 rounded-md border border-white/[0.08] bg-black/40 p-1 text-white/45 hover:bg-white/[0.06] hover:text-white/70"
            onClick={toggleLeft}
            type="button"
          >
            <PanelLeftOpenIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {rightCollapsed ? (
          <button
            aria-label="Show right panel"
            className="absolute top-2 right-1.5 z-10 rounded-md border border-white/[0.08] bg-black/40 p-1 text-white/45 hover:bg-white/[0.06] hover:text-white/70"
            onClick={toggleRight}
            type="button"
          >
            <PanelRightOpenIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
          {center}
        </div>
      </Panel>

      <Separator className="w-px bg-white/[0.06] transition-colors hover:bg-white/[0.12]" />

      <Panel
        className="relative flex min-h-0 min-w-0 flex-col overflow-hidden"
        collapsedSize={0}
        collapsible
        defaultSize={25}
        id="right"
        maxSize={40}
        minSize={25}
        onResize={() => {
          setRightCollapsed(rightPanelRef.current?.isCollapsed() ?? false);
        }}
        panelRef={rightPanelRef}
      >
        {!rightCollapsed ? (
          <button
            aria-label="Hide right panel"
            className="absolute top-2 left-1.5 z-10 rounded-md p-1 text-white/35 hover:bg-white/[0.06] hover:text-white/60"
            onClick={toggleRight}
            type="button"
          >
            <PanelRightCloseIcon className="h-3.5 w-3.5" />
          </button>
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {right}
        </div>
      </Panel>
    </Group>
  );
}
