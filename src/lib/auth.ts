import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";

export const auth = betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    plugins: [
        genericOAuth({
            config: [
                {
                    providerId: "wsva_oauth2",
                    clientId: process.env.OAUTH2_CLIENT_ID as string,
                    authorizationUrl: process.env.OAUTH2_AUTHORIZATION,
                    tokenUrl: process.env.OAUTH2_TOKEN,
                    pkce: true,
                    scopes: ["profile", "media"],
                    getUserInfo: async (token) => {
                        const userinfoUrl = process.env.OAUTH2_USERINFO;
                        if (!userinfoUrl) {
                            throw new Error("OAUTH2_USERINFO environment variable is not set");
                        }
                        const response = await fetch(userinfoUrl, {
                            headers: {
                                Authorization: `Bearer ${token.accessToken}`,
                            },
                        });
                        if (!response.ok) {
                            throw new Error(`OAuth2 userinfo request failed: ${response.status} ${response.statusText}`);
                        }
                        const profile = await response.json();
                        if (!profile.email) {
                            throw new Error("OAuth2 userinfo response missing required field: email");
                        }
                        return {
                            id: profile.email,
                            name: profile.name,
                            email: profile.email,
                            emailVerified: profile.verified_email,
                        };
                    },
                },
            ],
        }),
    ],
    session: {
        cookieCache: {
            enabled: true,
            maxAge: 5 * 60,
            strategy: "jwt",
        },
    },
});
