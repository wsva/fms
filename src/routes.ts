const publicRoutes = [
    '/',
    '/listening/dictation',
    '/blog',
    '/unauthorized'
]

const publicRoutesReg = [
    '/^\/blog/',
]

export function isPublicRoute(pathname: string): boolean {
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