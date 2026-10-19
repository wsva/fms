import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

const publicRoutes = [
    '/',
    '/listening/dictation',
    '/blog',
    '/unauthorized',
]

function isPublicRoute(pathname: string): boolean {
    if (publicRoutes.includes(pathname)) return true
    if (pathname.startsWith('/blog')) return true
    if (pathname.startsWith('/oauth2')) return true
    return false
}

export async function proxy(request: NextRequest) {
    const session = await auth.api.getSession({
        headers: await headers()
    });
    const { nextUrl } = request;

    const isPublic = isPublicRoute(nextUrl.pathname);

    if (isPublic) {
        return NextResponse.next();
    }

    if (!isPublic && !session) {
        const redirectUrl = nextUrl.pathname + nextUrl.search
        return NextResponse.redirect(new URL(`/unauthorized?redirect_url=${encodeURIComponent(redirectUrl)}`, nextUrl));
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - any path containing a dot, i.e. files served straight out of
         *   public/ (favicon.ico, manifest.webmanifest, icon-512.png, ...).
         * Static assets are not pages: gating them turns a logged-out visitor's
         * <img src="/icon-512.png"> into a 302 to /unauthorized, which renders
         * as a broken image instead of the logo.
         */
        '/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\..*).*)',
    ],
}