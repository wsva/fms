import NextAuth from "next-auth"

export const { handlers, signIn, signOut, auth } = NextAuth({
    // 配置 session 后才能使用 auth() 获取到 session 数据，包括 username, email
    session: { strategy: 'jwt' },
    providers: [
        // See https://authjs.dev/guides/configuring-oauth-providers
        // https://was_oauth2_service:33001/authorize?scope=openid+profile+email&response_type=code&client_id=undefined&redirect_uri=http%3A%2F%2Flocalhost%3A5000%2Fapi%2Fauth%2Fcallback%2Fwas_oauth2&code_challenge=OR8dVBB01P90pyA6iEkGaaNE7jQuv-XB3KPk7B2PLV8&code_challenge_method=S256
        {
            id: 'wsva_oauth2',
            name: 'WsvaProvider',
            type: 'oauth',
            issuer: "wsva_oauth2",
            authorization: {
                url: process.env.OAUTH2_AUTHORIZATION,
                params: { scope: "openid profile email" },
            },
            token: process.env.OAUTH2_TOKEN,
            userinfo: process.env.OAUTH2_USERINFO,
            clientId: process.env.OAUTH2_CLIENT_ID,
            /**
             * "pkce"	使用 PKCE（会生成 code_challenge/code_verifier）
             * "state"	使用 state 参数防止 CSRF 攻击（大多数 provider 默认支持）
             * "none"	不执行任何检查（极少使用）
             */
            checks: ["pkce", "state"],
            profile(profile) {
                return {
                    name: profile.name,
                    email: profile.email,
                }
            },
        },
    ],
    events: {
        async signOut(message) {
            if ("token" in message && message.token?.email) {
                const formData = new FormData();
                formData.append("user_id", message.token.email);
                await fetch(`${process.env.OAUTH2_LOGOUT}`, {
                    method: "POST",
                    body: formData,
                })
            }
        },
    },
    debug: true,
})