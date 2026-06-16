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

function readStoredLayout(layoutId: string): Layout | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  try {
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

export function ThreeColumnLayout({
  layoutId,
  left,
  center,
  right,
  className,
}: ThreeColumnLayoutProps) {
  const leftPanelRef = usePanelRef();
  const rightPanelRef = usePanelRef();
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [defaultLayout, setDefaultLayout] = useState<Layout>(DEFAULT_LAYOUT);

  useEffect(() => {
    setDefaultLayout(readStoredLayout(layoutId) ?? DEFAULT_LAYOUT);
  }, [layoutId]);

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
      className={cn("flex min-h-0 w-full flex-1", className)}
      defaultLayout={defaultLayout}
      id={layoutId}
      onLayoutChanged={(layout) => writeStoredLayout(layoutId, layout)}
      orientation="horizontal"
    >
      <Panel
        className="relative flex min-h-0 flex-col"
        collapsedSize={0}
        collapsible
        defaultSize={25}
        id="left"
        maxSize={33}
        minSize={18}
        onResize={() => {
          setLeftCollapsed(leftPanelRef.current?.isCollapsed() ?? false);
        }}
        panelRef={leftPanelRef}
      >
        <button
          aria-label={leftCollapsed ? "Show left panel" : "Hide left panel"}
          className="absolute top-2 right-1.5 z-10 rounded-md p-1 text-white/35 hover:bg-white/[0.06] hover:text-white/60"
          onClick={toggleLeft}
          type="button"
        >
          {leftCollapsed ? (
            <PanelLeftOpenIcon className="h-3.5 w-3.5" />
          ) : (
            <PanelLeftCloseIcon className="h-3.5 w-3.5" />
          )}
        </button>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {left}
        </div>
      </Panel>

      <Separator className="w-px bg-white/[0.06] transition-colors hover:bg-white/[0.12]" />

      <Panel
        className="relative flex min-h-0 min-w-0 flex-col"
        id="center"
        minSize={34}
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
        {center}
      </Panel>

      <Separator className="w-px bg-white/[0.06] transition-colors hover:bg-white/[0.12]" />

      <Panel
        className="relative flex min-h-0 flex-col"
        collapsedSize={0}
        collapsible
        defaultSize={25}
        id="right"
        maxSize={33}
        minSize={18}
        onResize={() => {
          setRightCollapsed(rightPanelRef.current?.isCollapsed() ?? false);
        }}
        panelRef={rightPanelRef}
      >
        <button
          aria-label={rightCollapsed ? "Show right panel" : "Hide right panel"}
          className="absolute top-2 left-1.5 z-10 rounded-md p-1 text-white/35 hover:bg-white/[0.06] hover:text-white/60"
          onClick={toggleRight}
          type="button"
        >
          {rightCollapsed ? (
            <PanelRightOpenIcon className="h-3.5 w-3.5" />
          ) : (
            <PanelRightCloseIcon className="h-3.5 w-3.5" />
          )}
        </button>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {right}
        </div>
      </Panel>
    </Group>
  );
}
