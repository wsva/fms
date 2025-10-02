import React from 'react'
import { initCmdMap } from '@/app/actions/voice_access';

export default async function Page() {
    const cmdMap = await initCmdMap();

    return (
        <div>
            <div className='text-xl text-red-500'>
                This page is used for debugging.
            </div>
            <div className='text-xl'>
                The latest variable cmdMap is as following:
            </div>
            <pre className='text-xl'>
                {JSON.stringify(Array.from(cmdMap.entries()), null, 2)}
            </pre>
        </div>
    )
}
