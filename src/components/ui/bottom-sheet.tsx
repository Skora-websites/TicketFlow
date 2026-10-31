"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { X, ChevronUp, ChevronDown, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type BottomSheetProps = React.ComponentProps<typeof DrawerPrimitive.Root> & {
  children?: React.ReactNode;
};

const BottomSheetContext = React.createContext<{
  snapPoints?: (number | string)[];
  activeSnapPoint?: number | string | null;
  setActiveSnapPoint?: (snapPoint: number | string | null) => void;
  isSnappable: boolean;
}>({
  isSnappable: false,
});

export function useBottomSheet() {
  return React.useContext(BottomSheetContext);
}

const BottomSheet = ({
  snapPoints,
  activeSnapPoint,
  setActiveSnapPoint,
  fadeFromIndex,
  shouldScaleBackground = false,
  children,
  ...props
}: BottomSheetProps) => {
  // If snapPoints is provided without activeSnapPoint control, keep internal state
  const [internalSnapPoint, setInternalSnapPoint] = React.useState<
    number | string | null
  >(snapPoints && snapPoints.length > 0 ? snapPoints[0] : null);

  const currentSnap = activeSnapPoint !== undefined ? activeSnapPoint : internalSnapPoint;
  const setSnap = setActiveSnapPoint || setInternalSnapPoint;

  const isSnappable = Boolean(snapPoints && snapPoints.length > 0);

  const rootProps: Record<string, any> = {
    shouldScaleBackground,
    ...props,
  };

  if (snapPoints && snapPoints.length > 0) {
    rootProps.snapPoints = snapPoints;
    rootProps.activeSnapPoint = currentSnap;
    rootProps.setActiveSnapPoint = setSnap;
    if (typeof fadeFromIndex === "number") {
      rootProps.fadeFromIndex = fadeFromIndex;
    }
  }

  return (
    <BottomSheetContext.Provider
      value={{
        snapPoints,
        activeSnapPoint: currentSnap,
        setActiveSnapPoint: setSnap,
        isSnappable,
      }}
    >
      <DrawerPrimitive.Root {...(rootProps as any)}>
        {children}
      </DrawerPrimitive.Root>
    </BottomSheetContext.Provider>
  );
};
BottomSheet.displayName = "BottomSheet";

const BottomSheetTrigger = DrawerPrimitive.Trigger;
const BottomSheetPortal = DrawerPrimitive.Portal;
const BottomSheetClose = DrawerPrimitive.Close;

const BottomSheetOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/60 backdrop-blur-xs transition-opacity duration-200",
      className
    )}
    {...props}
  />
));
BottomSheetOverlay.displayName = "BottomSheetOverlay";

export interface BottomSheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> {
  /** Display the visible pill grab handle at the top of the sheet */
  showHandle?: boolean;
  /** Display an accessible top-right close 'X' button */
  showCloseButton?: boolean;
  /** Override or omit overlay */
  hideOverlay?: boolean;
  overlayClassName?: string;
  containerClassName?: string;
}

const BottomSheetContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  BottomSheetContentProps
>(
  (
    {
      className,
      children,
      showHandle = true,
      showCloseButton = true,
      hideOverlay = false,
      overlayClassName,
      containerClassName,
      ...props
    },
    ref
  ) => {
    const { isSnappable } = useBottomSheet();

    return (
      <BottomSheetPortal>
        {!hideOverlay && <BottomSheetOverlay className={overlayClassName} />}
        <DrawerPrimitive.Content
          ref={ref}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-[24px] border-t border-x border-border/80 bg-background shadow-2xl transition-[max-height,transform] outline-none",
            // If snap points are used, allow full screen range up to 96dvh
            isSnappable ? "h-full max-h-[96dvh]" : "max-h-[92dvh] h-auto",
            className
          )}
          {...props}
        >
          {/* Accessible drag handle area */}
          {showHandle && (
            <div className="flex w-full items-center justify-center pt-3 pb-2 touch-none select-none">
              <DrawerPrimitive.Handle
                className="h-1.5 w-12 rounded-full bg-muted-foreground/30 hover:bg-muted-foreground/50 transition-colors cursor-grab active:cursor-grabbing"
                aria-label="Drag sheet handle"
              />
            </div>
          )}

          {/* Accessible Close Button */}
          {showCloseButton && (
            <BottomSheetClose
              className="absolute right-4 top-3.5 z-10 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close bottom sheet"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </BottomSheetClose>
          )}

          <div
            className={cn(
              "flex flex-1 flex-col overflow-hidden min-h-0",
              containerClassName
            )}
          >
            {children}
          </div>
        </DrawerPrimitive.Content>
      </BottomSheetPortal>
    );
  }
);
BottomSheetContent.displayName = "BottomSheetContent";

const BottomSheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col gap-1 px-5 pt-1 pb-3 text-left border-b border-border/40 shrink-0",
      className
    )}
    {...props}
  />
);
BottomSheetHeader.displayName = "BottomSheetHeader";

const BottomSheetTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn(
      "text-base sm:text-lg font-semibold tracking-tight text-foreground pr-8",
      className
    )}
    {...props}
  />
));
BottomSheetTitle.displayName = "BottomSheetTitle";

const BottomSheetDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-xs sm:text-sm text-muted-foreground", className)}
    {...props}
  />
));
BottomSheetDescription.displayName = "BottomSheetDescription";

export interface BottomSheetBodyProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** If true, applies safe area padding at the bottom for modern iOS/Android gesture bars */
  safeAreaBottom?: boolean;
}

const BottomSheetBody = React.forwardRef<HTMLDivElement, BottomSheetBodyProps>(
  ({ className, safeAreaBottom = true, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex-1 overflow-y-auto overscroll-contain px-5 py-3",
        safeAreaBottom && "pb-[max(1.25rem,env(safe-area-inset-bottom))]",
        className
      )}
      {...props}
    />
  )
);
BottomSheetBody.displayName = "BottomSheetBody";

const BottomSheetFooter = ({
  className,
  safeAreaBottom = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { safeAreaBottom?: boolean }) => (
  <div
    className={cn(
      "mt-auto flex flex-col gap-2 p-4 border-t border-border/40 bg-background/95 backdrop-blur-xs shrink-0 sm:flex-row sm:justify-end",
      safeAreaBottom && "pb-[max(1rem,env(safe-area-inset-bottom))]",
      className
    )}
    {...props}
  />
);
BottomSheetFooter.displayName = "BottomSheetFooter";

/**
 * Snap Point Controller widget to let users cycle or jump between
 * Compact, Intermediate, and Expanded states via click or keyboard navigation.
 */
export function BottomSheetSnapControls({
  labels = ["Compact", "Half", "Full"],
  className,
}: {
  labels?: [string, string, string] | string[];
  className?: string;
}) {
  const { snapPoints, activeSnapPoint, setActiveSnapPoint, isSnappable } =
    useBottomSheet();

  if (!isSnappable || !snapPoints || snapPoints.length <= 1) {
    return null;
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-muted/60 p-1 text-xs",
        className
      )}
      role="group"
      aria-label="Bottom sheet height presets"
    >
      {snapPoints.map((point, index) => {
        const isActive = activeSnapPoint === point;
        const label = labels[index] || `Level ${index + 1}`;
        return (
          <button
            key={String(point)}
            type="button"
            onClick={() => setActiveSnapPoint?.(point)}
            className={cn(
              "rounded-full px-2.5 py-0.5 font-medium transition-all",
              isActive
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-background/40"
            )}
            aria-pressed={isActive}
            aria-label={`Snap to ${label}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export {
  BottomSheet,
  BottomSheetTrigger,
  BottomSheetPortal,
  BottomSheetOverlay,
  BottomSheetClose,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetBody,
  BottomSheetFooter,
};
