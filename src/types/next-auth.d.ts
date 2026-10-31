import "next-auth";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      departmentId?: string;
      ticketAccess?: "department" | "assigned";
      theme?: "dark" | "light" | "system";
      colorTheme?: "purple" | "rose" | "lime" | "brown";
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
    departmentId?: string;
    remember?: boolean;
    theme?: "dark" | "light" | "system";
    colorTheme?: "purple" | "rose" | "lime" | "brown";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    departmentId?: string;
    ticketAccess?: "department" | "assigned";
    remember?: boolean;
    image?: string | null;
    theme?: "dark" | "light" | "system";
    colorTheme?: "purple" | "rose" | "lime" | "brown";
  }
}