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
                className="backdrop-blur-sm bg-sand-900/20"
            >
                <Modal.Container placement="center" className="w-[calc(100%-2rem)] md:w-2/3 mx-4 md:mx-auto">
                    <Modal.Dialog className="motto-rise rounded-3xl overflow-hidden border border-sand-200/80 shadow-2xl">
                        {() => (
                            <Modal.Body className="p-0">
                                <div
                                    className="flex flex-col items-center text-center gap-6 px-8 pt-10 pb-8"
                                    style={{
                                        background: 'linear-gradient(160deg, #FFFAF2 0%, #FEF3E5 60%, #FBEDDA 100%)',
                                    }}
                                >
                                    {/* Top ornament */}
                                    <div className="flex items-center gap-2">
                                        <span className="block w-8 h-px bg-sand-300" />
                                        <span className="text-sand-400 text-xs">✦</span>
                                        <span className="block w-8 h-px bg-sand-300" />
                                    </div>

                                    {/* Motto text */}
                                    <p className="text-sand-800 text-xl font-bold leading-loose tracking-wide whitespace-pre-wrap">
                                        {motto}
                                    </p>

                                    {/* Bottom ornament */}
                                    <div className="flex items-center gap-2">
                                        <span className="block w-8 h-px bg-sand-300" />
                                        <span className="text-sand-400 text-xs">✦</span>
                                        <span className="block w-8 h-px bg-sand-300" />
                                    </div>

                                    {/* Close */}
                                    <button
                                        onClick={() => setIsOpen(false)}
                                        className="mt-1 text-[10px] tracking-[0.2em] uppercase text-sand-500 hover:text-sand-800 border border-sand-300 hover:border-sand-500 bg-transparent hover:bg-sand-100 px-7 py-2 rounded-full transition-all duration-300 cursor-pointer"
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
