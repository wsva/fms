'use client';

import { useState } from 'react';

export default function Section({ title, children }: { title: string; children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="border border-sand-200 rounded-xl overflow-hidden">
            <button
                className="w-full flex items-center justify-start px-4 py-3 text-left hover:bg-sand-50 transition-colors"
                onClick={() => setOpen(o => !o)}
            >
                <span className={`text-sm mr-2 ${open ? 'rotate-90' : ''}`}>➤</span>
                <span className="text-sm font-semibold tracking-wider">{title}</span>
            </button>
            {open && <div className="px-4 pb-4 pt-1 flex flex-col gap-3">{children}</div>}
        </div>
    );
}
