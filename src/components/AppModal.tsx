import { Button, ButtonProps, Modal } from "@heroui/react";
import { ReactNode } from 'react';

type Props = {
    isOpen: boolean;
    onClose: () => void;
    header?: ReactNode;
    body: ReactNode;
    footerButtons?: ButtonProps[];
    imageModal?: boolean;
    className?: string;
}

export default function AppModal({ isOpen, onClose, header, body, footerButtons, imageModal, className }: Props) {

    const handleClose = () => {
        setTimeout(() => onClose(), 10);
    }

    return (
        <Modal>
            <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => { if (!open) handleClose() }}>
                <Modal.Container placement="top" className={`${imageModal ? 'border-2 border-white' : ''} ${className ?? ''}`}>
                    <Modal.Dialog>
                        {({ close: _close }) => (
                            <>
                                {!imageModal && header && (
                                    <Modal.Header>
                                        <Modal.Heading>{header}</Modal.Heading>
                                    </Modal.Header>
                                )}
                                <Modal.Body className={imageModal ? 'p-0' : ''}>
                                    {body}
                                </Modal.Body>
                                {!imageModal && footerButtons && (
                                    <Modal.Footer>
                                        {footerButtons.map((props: ButtonProps, index) => (
                                            <Button {...props} key={index}>
                                                {props.children}
                                            </Button>
                                        ))}
                                    </Modal.Footer>
                                )}
                            </>
                        )}
                    </Modal.Dialog>
                </Modal.Container>
            </Modal.Backdrop>
        </Modal>
    )
}
