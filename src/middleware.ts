import { auth as middleware } from "@/auth"
import { isPublicRoute } from "./routes";
import { NextResponse } from "next/server";

export default middleware((req) => {
    const { nextUrl } = req;
    const isLoggedIn = !!req.auth;

    const isPublic = isPublicRoute(nextUrl.pathname);

    if (isPublic) {
        return NextResponse.next();
    }

    if (!isPublic && !isLoggedIn) {
        return NextResponse.redirect(new URL('/unauthorized', nextUrl));
    }

    return NextResponse.next();
})

export const config = {
    matcher: [
      /*
       * Match all request paths except for the ones starting with:
       * - api (API routes)
       * - _next/static (static files)
       * - _next/image (image optimization files)
       * - favicon.ico (favicon file)
       */
      '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
  }