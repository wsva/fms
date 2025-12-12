import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

const publicRoutes = [
    '/',
    '/listening/dictation',
    '/blog',
    '/unauthorized'
]

const publicRoutesReg = [
    '/^\/blog/',
]

function isPublicRoute(pathname: string): boolean {
    if (publicRoutes.includes(pathname)) {
        return true
    }
    for (const reg in publicRoutesReg) {
        if (RegExp(reg).test(pathname)) {
            return true
        }
    }
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
        return NextResponse.redirect(new URL('/unauthorized', nextUrl));
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
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
}