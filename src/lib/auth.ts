import NextAuth, { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { randomBytes } from "node:crypto";
import { connectDB } from "@/lib/db/mongo";
import { User } from "@/lib/db/models";
import { verifyPassword, hashPassword } from "@/lib/password";

// Per-process TTL cache for session re-validation lookups (see jwt callback).
const SESSION_CHECK_TTL_MS = 60_000;
const sessionUserCache = new Map<string, { checkedAt: number }>();

// Force the next request from this user to re-check the DB immediately,
// instead of waiting out the TTL. Called after password changes so the
// invalidation takes effect on the very next request.
export function invalidateSessionCheck(userId: string) {
  sessionUserCache.delete(userId);
}

// Same mechanism, different semantics: role/department/active changes take
// effect on the user's next request rather than up to 60s later.
export function invalidatePermissionsCheck(userId: string) {
  sessionUserCache.delete(userId);
}

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        // Reject non-string credentials outright: a crafted JSON body could
        // otherwise inject Mongo operator objects (e.g. { $ne: null }).
        if (
          typeof credentials?.email !== "string" ||
          typeof credentials?.password !== "string" ||
          !credentials.email ||
          !credentials.password
        ) {
          return null;
        }

        // ponytail: "Remember me" carries via an `rm` cookie set on the login form.
        // Per-session JWT maxAge is limited, so we extend token.exp when set.
        let remember = false;
        try {
          const cookie = (request as { headers?: { get?: (k: string) => string | null } })
            ?.headers?.get?.("cookie") ?? "";
          remember = /(?:^|;\s*)rm=1/.test(cookie);
        } catch {
          /* ignore */
        }

        await connectDB();

        const email = credentials.email.trim().toLowerCase();
        const user = await User.findOne({ email }).select("+passwordHash");
        if (!user || !user.active) {
          return null;
        }

        const isValid = await verifyPassword(credentials.password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          departmentId: user.departmentId?.toString(),
          remember,
        };
      },
    }),
    ...(process.env.AUTH_GOOGLE_ID
      ? [Google({ clientId: process.env.AUTH_GOOGLE_ID, clientSecret: process.env.AUTH_GOOGLE_SECRET! })]
      : []),
    ...(process.env.AUTH_GITHUB_ID
      ? [GitHub({ clientId: process.env.AUTH_GITHUB_ID, clientSecret: process.env.AUTH_GITHUB_SECRET! })]
      : []),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      // Block inactive accounts on any provider, and provision a client account
      // for first-time OAuth logins so the session always has a real role.
      if (!user?.email) return false;
      await connectDB();
      const email = user.email.toLowerCase();

      // OAuth: only link to an existing (or create a new) account when the
      // provider has verified the email. GitHub allows unverified emails, so
      // confirm ownership via the GitHub emails API before linking — otherwise
      // an attacker could register a provider account with a victim's email
      // and inherit their local session.
      if (account?.provider === "google" && (profile as { email_verified?: boolean } | null)?.email_verified === false) {
        return false;
      }
      if (account?.provider === "github" && typeof account.access_token === "string") {
        try {
          const res = await fetch("https://api.github.com/user/emails", {
            headers: {
              Authorization: `Bearer ${account.access_token}`,
              Accept: "application/vnd.github+json",
            },
          });
          if (!res.ok) return false; // fail closed: cannot prove email ownership
          const emails = (await res.json()) as { email: string; verified: boolean }[];
          const match = emails.find((e) => e.email.toLowerCase() === email);
          if (!match?.verified) return false;
        } catch {
          return false;
        }
      }

      const dbUser = await User.findOne({ email }).lean();
      if (dbUser && dbUser.active === false) return false;
      if (account?.provider !== "credentials" && !dbUser) {
        await User.create({
          name: user.name ?? email.split("@")[0],
          email,
          passwordHash: await hashPassword(randomBytes(16).toString("hex")),
          role: "client",
          active: true,
        });
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        // Resolve canonical DB identity. For OAuth the provider `user` lacks our
        // role/department, so we always read from the DB (source of truth).
        await connectDB();
        const dbUser = await User.findOne({ email: user.email.toLowerCase() }).lean();
        if (dbUser) {
          token.id = dbUser._id.toString();
          token.role = dbUser.role;
          token.departmentId = dbUser.departmentId?.toString();
          token.ticketAccess = dbUser.ticketAccess ?? "department";
          token.active = dbUser.active !== false;
          token.sessionVersion = dbUser.sessionVersion ?? 0;
        } else if (user.id) {
          token.id = user.id;
          token.active = true;
        }
        if ((user as { remember?: boolean }).remember) {
          token.remember = true;
          token.exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 120; // 120d when "remember me"
        }
        return token;
      }

      // Subsequent requests: periodically re-validate the session user against
      // the DB so deactivation, deletion, and role/department changes take
      // effect without waiting for JWT expiry.
      if (typeof token.id === "string") {
        const now = Date.now();
        const cached = sessionUserCache.get(token.id);
        if (!cached || now - cached.checkedAt > SESSION_CHECK_TTL_MS) {
          await connectDB();
          const dbUser = await User.findById(token.id)
            // sessionVersion MUST be in the projection: the comparison below
            // treats a missing field as 0, which would instantly kill the
            // session of anyone whose password was ever changed/reset (their
            // JWT carries the real, bumped version).
            .select("role departmentId ticketAccess active sessionVersion")
            .lean();
          sessionUserCache.set(token.id, { checkedAt: now });
          if (sessionUserCache.size > 1000) {
            // Bound cache growth; entries are cheap so full prune is fine.
            sessionUserCache.clear();
          }
          if (!dbUser || dbUser.active === false) {
            token.active = false;
          } else {
            // Session-version check: a password change bumps the user's
            // version, so any JWT minted before it (stolen session) fails here.
            // Legacy tokens without a version adopt the current one once, so
            // this deploy doesn't log everyone out — but they die on the next
            // password change.
            const dbVersion = dbUser.sessionVersion ?? 0;
            const tokenVersion =
              typeof token.sessionVersion === "number" ? token.sessionVersion : dbVersion;
            token.sessionVersion = tokenVersion;
            if (tokenVersion !== dbVersion) {
              token.active = false;
            } else {
              token.active = true;
              token.role = dbUser.role;
              token.departmentId = dbUser.departmentId?.toString();
              token.ticketAccess = dbUser.ticketAccess ?? "department";
            }
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.active === false) {
        // Deactivated/deleted user: surface as an empty session so every
        // server-side check (requireAuth/requireApiRole/getUser) treats the
        // request as unauthenticated.
        (session as unknown as { user: unknown }).user = null;
        return session;
      }
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.role = (token.role as string) ?? "client";
        session.user.departmentId = token.departmentId as string | undefined;
        session.user.ticketAccess =
          token.ticketAccess === "assigned" ? "assigned" : "department";
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  secret: process.env.AUTH_SECRET,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
