"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors border",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground shadow-xs shadow-primary/20",
        secondary: "border-border/60 bg-secondary/80 text-secondary-foreground",
        destructive: "border-destructive/20 bg-destructive/10 text-destructive",
        outline: "text-foreground border-border/80 bg-card/60",
        success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
        warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
        info: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
        accent: "bg-primary/10 text-primary border-primary/20",
        subtle: "bg-muted/70 text-muted-foreground border-border/60",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "px-2 py-0.5 text-[11px]",
        lg: "px-3.5 py-1 text-sm font-semibold",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };