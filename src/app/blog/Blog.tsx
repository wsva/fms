'use client'

import { formatDate } from '@/lib/utils';
import { Button } from "@heroui/react"
import { Link } from "@heroui/react"
import { blog } from "@/generated/prisma/client";

type Props = {
    list: blog[];
}

export default function Blog({ list }: Props) {
    return (
        <div className="flex flex-col gap-6 my-6 max-w-3xl mx-auto px-2">

            {/* Header */}
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold text-foreground">Blog</h1>
                <Button as={Link} href="/blog/add" target="_blank" color="primary" size="sm">
                    Write New Post
                </Button>
            </div>

            {/* Post list */}
            {list.length === 0 ? (
                <p className="text-foreground-400 text-center py-12">No posts yet.</p>
            ) : (
                <div className="flex flex-col gap-4">
                    {list.map((item) => (
                        <Link
                            key={item.uuid}
                            href={`/blog/${item.uuid}`}
                            target="_blank"
                            className="block group"
                        >
                            <div className="flex flex-col gap-1.5 p-4 rounded-xl border border-sand-300 bg-sand-100 hover:bg-sand-200 hover:border-sand-400 transition-colors">
                                <span className="text-xl font-semibold text-primary group-hover:underline leading-snug">
                                    {item.title}
                                </span>
                                {item.description && (
                                    <span className="text-sm text-foreground-500 line-clamp-2">
                                        {item.description}
                                    </span>
                                )}
                                <span className="text-xs text-foreground-400 mt-1">
                                    {formatDate(item.created_at)}
                                </span>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
