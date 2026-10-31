"use client";

import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import {
  BottomSheet,
  BottomSheetTrigger,
  BottomSheetContent,
  BottomSheetHeader,
  BottomSheetFooter,
  BottomSheetTitle,
  BottomSheetDescription,
  BottomSheetBody,
  BottomSheetClose,
  BottomSheetSnapControls,
} from "@/components/ui/bottom-sheet";
import { cn } from "@/lib/utils";

export interface ResponsiveSheetProps {
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Mobile snap points. Default is [0.45, 0.85] */
  snapPoints?: (number | string)[];
  activeSnapPoint?: number | string | null;
  setActiveSnapPoint?: (snapPoint: number | string | null) => void;
}

export function ResponsiveSheet({
  children,
  open,
  onOpenChange,
  snapPoints = [0.5, 0.9],
  activeSnapPoint,
  setActiveSnapPoint,
}: ResponsiveSheetProps) {
  const isMobile = useIsMobile();

  // If isMobile is undefined (during SSR/initial hydrate), render Dialog structure safely
  if (isMobile) {
    return (
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        snapPoints={snapPoints}
        activeSnapPoint={activeSnapPoint}
        setActiveSnapPoint={setActiveSnapPoint}
      >
        {children}
      </BottomSheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children}
    </Dialog>
  );
}

export const ResponsiveSheetTrigger = ({
  asChild,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogTrigger>) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <BottomSheetTrigger asChild={asChild} {...props}>
        {children}
      </BottomSheetTrigger>
    );
  }
  return (
    <DialogTrigger asChild={asChild} {...props}>
      {children}
    </DialogTrigger>
  );
};

export interface ResponsiveSheetContentProps {
  children?: React.ReactNode;
  className?: string;
  showHandle?: boolean;
  showCloseButton?: boolean;
}

export const ResponsiveSheetContent = React.forwardRef<
  HTMLDivElement,
  ResponsiveSheetContentProps
>(({ className, children, showHandle = true, showCloseButton = true }, ref) => {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <BottomSheetContent
        ref={ref}
        className={className}
        showHandle={showHandle}
        showCloseButton={showCloseButton}
      >
        {children}
      </BottomSheetContent>
    );
  }

  return (
    <DialogContent ref={ref} className={className}>
      {children}
    </DialogContent>
  );
});
ResponsiveSheetContent.displayName = "ResponsiveSheetContent";

export const ResponsiveSheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <BottomSheetHeader className={className} {...props} />;
  }
  return <DialogHeader className={className} {...props} />;
};

export const ResponsiveSheetTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof DialogTitle>
>(({ className, ...props }, ref) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <BottomSheetTitle ref={ref} className={className} {...props} />;
  }
  return <DialogTitle ref={ref} className={className} {...props} />;
});
ResponsiveSheetTitle.displayName = "ResponsiveSheetTitle";

export const ResponsiveSheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof DialogDescription>
>(({ className, ...props }, ref) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <BottomSheetDescription ref={ref} className={className} {...props} />;
  }
  return <DialogDescription ref={ref} className={className} {...props} />;
});
ResponsiveSheetDescription.displayName = "ResponsiveSheetDescription";

export const ResponsiveSheetBody = ({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <BottomSheetBody className={className} {...props}>
        {children}
      </BottomSheetBody>
    );
  }
  return (
    <div className={cn("py-2", className)} {...props}>
      {children}
    </div>
  );
};

export const ResponsiveSheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <BottomSheetFooter className={className} {...props} />;
  }
  return <DialogFooter className={className} {...props} />;
};

export const ResponsiveSheetClose = ({
  asChild,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof DialogClose>) => {
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <BottomSheetClose asChild={asChild} {...props}>
        {children}
      </BottomSheetClose>
    );
  }
  return (
    <DialogClose asChild={asChild} {...props}>
      {children}
    </DialogClose>
  );
};

export { BottomSheetSnapControls };
