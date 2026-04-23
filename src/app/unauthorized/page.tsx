import { Suspense } from 'react'
import LoginButton from './LoginButton'

export default function Page() {
    return (
        <div className="flex flex-col items-center justify-center gap-4 h-[80svh]">
            <p className="text-gray-500">need login</p>
            <Suspense>
                <LoginButton />
            </Suspense>
        </div>
    )
}
