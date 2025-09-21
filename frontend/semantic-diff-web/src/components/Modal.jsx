import React from 'react';

export default function Modal({ open, title, children, onClose }) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
      className="fixed inset-0 z-[9999] isolate bg-black/35 backdrop-blur-[1px] flex items-center justify-center"
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-card text-card-foreground w-[90%] max-w-[800px] rounded-lg shadow-2xl border border-border animate-fade-in"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
          <h3 className="m-0 text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md bg-secondary hover:bg-secondary/80 transition"
          >
            Close
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
