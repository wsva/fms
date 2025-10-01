"use client"

import React from 'react'
import { Link } from '@heroui/react';

export default function Page() {
    return (
        <div className='flex flex-col items-start my-1 gap-4 mt-2'>
            <Link className='text-2xl text-blue-600 hover:underline'
                href={`/word/top?lang=de`}
            >
                German, exclude words in cards
            </Link>
            <Link className='text-2xl text-blue-600 hover:underline'
                href={`/word/top?lang=de&all`}
            >
                German, all words
            </Link>
        </div>

    )
}
