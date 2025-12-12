'use client'

import { Link } from "@heroui/react";
import { practice_text } from "@/generated/prisma/client";

type Props = {
    user_id: string;
    item: practice_text;
    handleDelete: (item: practice_text) => Promise<void>;
}

export default function Page({ user_id, item, handleDelete }: Props) {
    return (
        <div className={`flex flex-col w-full items-start rounded-md p-1 bg-sand-300`}>
            <div className='flex flex-row w-full items-center justify-start gap-2'>
                <Link target='_blank'
                    href={`/speak/practice/${item.uuid}`}
                    className='text-2xl text-blue-600 hover:underline'
                >
                    <pre className='font-roboto leading-none text-wrap'>
                        {item.text}
                    </pre>
                </Link>
            </div>
            <div className="flex flex-row w-full items-center justify-end gap-4">
                <Link target='_blank'
                    href={`/speak/practice?user_id=${item.user_id}`}
                    className='text-sm text-gray-500 hover:underline w-full'
                >
                    {`by ${item.user_id}`}
                </Link>
                {item.user_id === user_id && (
                    <Link as='button' isBlock color='danger' className='text-xl'
                        onPress={async () => {
                            if (window.confirm("Are you sure to delete?")) {
                                await handleDelete(item);
                            }
                        }}
                    >
                        delete
                    </Link>
                )}
            </div>
        </div>
    )
}
