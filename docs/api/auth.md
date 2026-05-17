# Authentication

Authentication is handled by [better-auth](https://better-auth.com) via OAuth2/PKCE with the WSVA provider.

| Endpoint | Description |
|---|---|
| `GET /api/auth/signin/wsva_oauth2` | Start the OAuth2 sign-in flow |
| `GET /api/auth/callback/wsva_oauth2` | OAuth2 callback (handled automatically) |
| `POST /api/auth/signout` | Sign out and clear the session cookie |

After a successful sign-in, the session cookie is set automatically by the browser. All authenticated endpoints rely on this cookie.
