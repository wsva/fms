import React from 'react'
import { initCmdMap } from '../actions/voice_access';

export default async function Page() {
    const cmdMap = await initCmdMap();

    return (
        <div>
            <pre className='text-xl'>
                {JSON.stringify(Array.from(cmdMap.entries()), null, 2)}
            </pre>
        </div>
    )
}
