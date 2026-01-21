import React from "react";
import { cn } from "../../lib/utils";
import { FaSearch } from "react-icons/fa";

// 1. Sửa Generic Type: Đổi HTMLDivElement -> HTMLInputElement
// 2. Sửa Props Type: Đổi HTMLAttributes -> InputHTMLAttributes
const SearchBar = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>
  (({ className, ...props }, ref) => {
    return (
      <div className="relative flex items-center w-full max-w-sm">
        
        {/* Icon: Giữ nguyên logic absolute */}
        <FaSearch className="absolute left-3 text-slate-400 pointer-events-none" size={14} />

        <input
          ref={ref}
          type="search" 
          className={cn(
            // Base styles
            "flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm",
            "pl-10", 
            // Placeholder & Focus states
            "placeholder:text-slate-400 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500",
            // Disabled state
            "disabled:cursor-not-allowed disabled:opacity-50",
            // Search input specific: Xóa nút 'x' mặc định của trình duyệt nếu muốn custom (tùy chọn)
            // "[&::-webkit-search-cancel-button]:appearance-none", 
            className
          )}
          {...props}
        />
      </div>
    );
  });

SearchBar.displayName = "SearchBar";

export { SearchBar };