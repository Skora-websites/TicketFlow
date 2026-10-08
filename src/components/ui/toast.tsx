"use client";

import { toast as sonnerToast } from "sonner";
import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      theme="system"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg rounded-xl",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
    />
  );
}

type ToastOptions = {
  title: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
  action?: {
    label: string;
    onClick: () => void;
  };
};

export function useToast() {
  return {
    toast: ({ title, description, variant = "default", action }: ToastOptions) => {
      const options: any = {
        description,
        action: action
          ? {
              label: action.label,
              onClick: action.onClick,
            }
          : undefined,
      };

      switch (variant) {
        case "destructive":
          sonnerToast.error(title, options);
          break;
        case "success":
          sonnerToast.success(title, options);
          break;
        default:
          sonnerToast(title, options);
      }
    },
  };
}

export type { ToastOptions };