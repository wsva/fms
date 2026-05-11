"use client";

import Link from 'next/link'
import { usePathname } from 'next/navigation';

type Props = {
    href: string;
    label: string;
}

export default function NavLink({ href, label }: Props) {
    const pathname = usePathname();
    return (
        <Link
            href={href}
            className={`text-sm text-gray-500 uppercase hover:text-gray-700 ${pathname === href ? 'font-bold' : ''}`}
        >
            {label}
        </Link>
    )
}
