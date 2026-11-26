import React, { useEffect, useRef } from 'react';
import { IconClose } from './CivicIcons';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({ isOpen, onClose, title, children }) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="bottom-sheet-overlay" onClick={onClose}>
      <div
        className="bottom-sheet-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bottom-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bottom-sheet-handle-bar">
          <div className="bottom-sheet-handle" />
        </div>
        <div className="bottom-sheet-header">
          <h2 id="bottom-sheet-title" className="bottom-sheet-title">{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="bottom-sheet-close"
            onClick={onClose}
            aria-label="Close details"
          >
            <IconClose size={18} />
          </button>
        </div>
        <div className="bottom-sheet-body">
          {children}
        </div>
      </div>
    </div>
  );
};
