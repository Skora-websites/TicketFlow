import "next-auth";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      departmentId?: string;
      ticketAccess?: "department" | "assigned";
    } & DefaultSession["user"];
  }

  interface User {
    role: string;
    departmentId?: string;
    remember?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    departmentId?: string;
    ticketAccess?: "department" | "assigned";
    remember?: boolean;
  }
}