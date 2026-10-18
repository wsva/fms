'use client';

import { useState } from 'react';
import { Modal } from "@heroui/react";

export default function MottoPopup({ motto }: { motto: string }) {
    const [isOpen, setIsOpen] = useState(true);

    return (
        <Modal>
            <Modal.Backdrop
                isOpen={isOpen}
                onOpenChange={(open) => { if (!open) setIsOpen(false); }}
                className="backdrop-blur-sm bg-black/20"
            >
                <Modal.Container placement="center" className="w-[calc(100%-2rem)] md:w-2/3 mx-4 md:mx-auto">
                    <Modal.Dialog className="motto-rise rounded-3xl overflow-hidden border border-border-default shadow-2xl">
                        {() => (
                            <Modal.Body className="p-0">
                                <div
                                    className="flex flex-col items-center text-center gap-6 px-8 pt-10 pb-8 bg-bg-card"
                                >
                                    {/* Top ornament */}
                                    <div className="flex items-center gap-2">
                                        <span className="block w-8 h-px bg-bg-progress" />
                                        <span className="text-text-tertiary text-xs">✦</span>
                                        <span className="block w-8 h-px bg-bg-progress" />
                                    </div>

                                    {/* Motto text */}
                                    <p className="text-text-primary text-xl font-bold leading-loose tracking-wide whitespace-pre-wrap">
                                        {motto}
                                    </p>

                                    {/* Bottom ornament */}
                                    <div className="flex items-center gap-2">
                                        <span className="block w-8 h-px bg-bg-progress" />
                                        <span className="text-text-tertiary text-xs">✦</span>
                                        <span className="block w-8 h-px bg-bg-progress" />
                                    </div>

                                    {/* Close */}
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="mt-1 text-[10px] tracking-[0.2em] uppercase text-text-tertiary hover:text-text-primary border border-border-default hover:border-accent bg-transparent hover:bg-bg-hover px-7 py-2 rounded-full transition-all duration-300 cursor-pointer"
                                    >
                                        Begin
                                    </button>
                                </div>
                            </Modal.Body>
                        )}
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    );
}
