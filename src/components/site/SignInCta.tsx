"use client";

// The landing CTA that opens the app. Server-rendered as a plain <a> so the copy
// stays crawlable, but the guest path must NOT be a bare link to /oauth2/login:
// that page only mints the OAuth2 provider's own access_token cookies, which the
// app's session reader (proxy.ts + every (app) page) does not recognise — a
// visitor would land on /home and get bounced to /unauthorized. Guests instead
// run the same Better Auth social dance the Sidebar and /unauthorized use, which
// exchanges the OAuth2 code for a real session. The href is kept as a
// crawl/no-JS fallback to the login page.

import type { ReactNode } from "react";
import { authClient } from "@/lib/auth-client";

type Props = {
    /** True when the visitor already has a session — renders a plain app link. */
    signedIn: boolean;
    /** Where a signed-in visitor goes; also the OAuth callback target. */
    appHref: string;
    className: string;
    children: ReactNode;
};

export default function SignInCta({ signedIn, appHref, className, children }: Props) {
    if (signedIn) {
        return (
            <a href={appHref} className={className}>
                {children}
            </a>
        );
    }

    return (
        <a
            href={`/oauth2/login?return_to=${encodeURIComponent(appHref)}`}
            className={className}
            onClick={(e) => {
                e.preventDefault();
                void authClient.signIn.social({ provider: "wsva_oauth2", callbackURL: appHref });
            }}
        >
            {children}
        </a>
    );
}
