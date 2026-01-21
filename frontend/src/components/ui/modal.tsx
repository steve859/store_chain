import React, { useEffect } from 'react';
import { FaTimes } from 'react-icons/fa';
import { cn } from '../../lib/utils'; // Đảm bảo đường dẫn đúng

// 1. Định nghĩa kiểu dữ liệu cho Props (Interface)
interface ModalProps extends React.HTMLAttributes<HTMLDivElement> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

// 2. Khai báo Generic cho forwardRef: <Kiểu_Ref, Kiểu_Props>
const Modal = React.forwardRef<HTMLDivElement, ModalProps>(
  ({ isOpen, onClose, title, children, className, ...props }, ref) => {

    // Logic khóa cuộn trang khi Modal mở
    useEffect(() => {
      if (isOpen) {
        document.body.style.overflow = 'hidden';
      } else {
        document.body.style.overflow = 'unset';
      }
      return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
      <div className="fixed top-0 left-0 right-0 bottom-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity p-4 animate-in fade-in duration-200" style={{ margin: 0 }}>
        <div
          ref={ref}
          className={cn(
            "relative w-full max-w-lg rounded-lg bg-white shadow-xl animate-in zoom-in-95 duration-200",
            className
          )}
          {...props}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b p-4">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <button
              onClick={onClose}
              type="button"
              className="rounded-full p-1 hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <FaTimes />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 hide-scrollbar">{children}</div>
        </div>
      </div>
    );
  }
);

Modal.displayName = "Modal";

export default Modal;