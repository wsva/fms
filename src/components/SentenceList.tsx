import Link from 'next/link';
import React from 'react'

type Props = {
    list: string[];
}

export default function SentenceList({ list }: Props) {
    return (
        <div className="flex flex-col w-full gap-4 py-4" >
            {list.map((v, i) => {
                return <div key={i}
                    className="flex flex-col w-full items-start bg-slate-200 rounded-md p-1"
                >
                    <div className="text-xl whitespace-pre-wrap" >{v}</div>
                    <div className="flex flex-row w-full items-end justify-end gap-4">
                        <Link className='text-blue-600 hover:underline' target='_blank'
                            href={`/card/add?edit=y&content=${encodeURIComponent(v)}`}
                        >
                            Add to Card
                        </Link>
                    </div>
                </div>
            })}
        </div>
    )
}
