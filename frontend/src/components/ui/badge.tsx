import React from "react";
import { cn } from "../../lib/utils";

const Badge = 
    React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>
    (({className, ...props}, ref) => (
        <div
            ref = {ref}
            className={cn("font-bold text-sm text-white-600 border rounded-lg px-2",className)}{...props}
        />
    ));
Badge.displayName = "Badge";

export { Badge };