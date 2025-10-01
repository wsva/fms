import { auth as middleware } from "@/auth"
import { authRoutes, isPublicRoute } from "./routes";
import { NextResponse } from "next/server";
import { toast } from 'react-toastify'

export default middleware((req) => {
    const { nextUrl } = req;
    const isLoggedIn = !!req.auth;

    const isPublic = isPublicRoute(nextUrl.pathname);
    const isAuthRoute = authRoutes.includes(nextUrl.pathname);

    if (isPublic) {
        return NextResponse.next();
    }

    if (isAuthRoute) {
        if (isLoggedIn) {
            return NextResponse.redirect(new URL('/', nextUrl));
        }
        return NextResponse.next();
    }

    if (!isPublic && !isLoggedIn) {
        toast.error("need login")
        return NextResponse.redirect(new URL('/', nextUrl));
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