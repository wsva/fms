"use client"

import { initCmdMap } from '@/app/actions/voice_access';
import { Action } from '@/lib/types';
import { useEffect, useState } from 'react';

export default function Page() {
    const [stateCmd, setStateCmd] = useState<Map<string, Action>>(new Map());

    useEffect(() => {
        const loadData = async () => {
            const cmdMap = await initCmdMap();
            setStateCmd(cmdMap);
        };
        loadData();
    }, []);



    return (
        <div>
            <div className='text-xl text-red-500'>
                This page is used for debugging.
            </div>
            <div className='text-xl'>
                The latest variable cmdMap is as following:
            </div>
            <pre className='text-xl'>
                {JSON.stringify(Array.from(stateCmd.entries()), null, 2)}
            </pre>
        </div>
    )
}
