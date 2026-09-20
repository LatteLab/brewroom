import { auth } from "@/auth";
import { NextResponse } from "next/server";

export const proxy = auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  // Public routes that don't require authentication
  const publicRoutes = ["/login", "/"];
  const isPublicRoute =
    publicRoutes.includes(pathname) ||
    pathname.startsWith("/api/auth") ||
    // Cron + webhook endpoints authenticate themselves via bearer token / signature.
    // They must bypass NextAuth or Vercel Cron and external webhook providers can't reach them.
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/webhooks");

  // Allow public routes
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login
  if (!isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin routes protection
  const isAdminRoute = pathname.startsWith("/admin");

  if (isAdminRoute && !req.auth?.user?.isAdmin) {
    return NextResponse.redirect(new URL("/user", req.url));
  }

  // Force incomplete profiles through onboarding
  const isOnboarding = pathname === "/user/onboarding";
  if (
    isLoggedIn &&
    !req.auth?.user?.isAdmin &&
    req.auth?.user?.profileComplete === false &&
    pathname.startsWith("/user") &&
    !isOnboarding
  ) {
    return NextResponse.redirect(new URL("/user/onboarding", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
