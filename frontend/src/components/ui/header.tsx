import React from "react";
import { cn } from "../../lib/utils";

const Header = 
    React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>
    (({className, ...props}, ref) => (
        <div
            ref = {ref}
            className={cn("font-medium text-3xl text-slate-800",className)}{...props}
        />
    ));
Header.displayName = "Header";

export { Header };