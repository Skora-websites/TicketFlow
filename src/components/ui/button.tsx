"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-xs font-semibold tracking-[-0.01em] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer",
  {
    variants: {
      variant: {
        // Primary commit action
        default:
          "bg-primary text-primary-foreground border border-primary/20 shadow-xs hover:opacity-90 active:scale-[0.98]",
        // Signature standout CTA: Accent color (Rose in dark, Lime in lime)
        accent:
          "bg-accent text-accent-foreground border border-accent shadow-xs hover:opacity-90 active:scale-[0.98]",
        // Destructive action: Rich crimson with crisp edge & bevel
        destructive:
          "bg-[#DC2626] text-white border border-[#B91C1C] shadow-[0_1px_2px_rgba(220,38,38,0.2)] hover:bg-[#B91C1C] active:scale-[0.98] dark:bg-[#EF4444] dark:border-[#DC2626]",
        // Destructive outline: Secondary delete/reject/deny actions
        "destructive-outline":
          "border border-destructive/30 bg-card text-destructive hover:bg-destructive hover:text-white hover:border-destructive active:scale-[0.98]",
        // Positive / Confirmation action
        success:
          "bg-[#15803D] text-white border border-[#166534] shadow-[0_1px_2px_rgba(21,128,61,0.2)] hover:bg-[#166534] active:scale-[0.98] dark:bg-[#10B981] dark:border-[#059669]",
        // Success outline: Secondary approve/resolve actions
        "success-outline":
          "border border-emerald-500/40 bg-emerald-950/20 text-emerald-400 hover:bg-emerald-600 hover:text-white active:scale-[0.98]",
        // Warning / Caution action: Rich amber for holding/internal notes
        warning:
          "bg-[#D97706] text-white border border-[#B45309] shadow-[0_1px_2px_rgba(217,119,6,0.2)] hover:bg-[#B45309] active:scale-[0.98] dark:bg-[#F59E0B] dark:border-[#D97706]",
        // Warning outline: Secondary caution/reopen actions
        "warning-outline":
          "border border-amber-500/40 bg-amber-50/60 text-amber-800 hover:bg-amber-600 hover:text-white active:scale-[0.98]",
        // Secondary / Neutral action: Theme-aware surface
        outline:
          "border border-border bg-card text-foreground shadow-2xs hover:bg-secondary active:scale-[0.98]",
        // Grouped utility / quiet actions
        secondary:
          "bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80 active:scale-[0.98]",
        // Low-friction inline/icon actions
        ghost:
          "text-muted-foreground hover:bg-secondary/75 hover:text-foreground active:scale-[0.98]",
        // Link action
        link: "text-foreground underline-offset-4 hover:underline p-0 h-auto font-medium",
      },
      size: {
        default: "h-8.5 px-3.5 py-1.5",
        sm: "h-7 rounded-md px-2.5 text-[11px]",
        lg: "h-9.5 rounded-lg px-4 text-xs font-bold",
        xl: "h-10.5 rounded-lg px-5 text-sm font-bold",
        icon: "h-8.5 w-8.5 rounded-lg",
        "icon-sm": "h-7 w-7 rounded-md",
        "icon-lg": "h-9 w-9 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading ? (
          <>
            <svg className="mr-2 h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Loading...</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };