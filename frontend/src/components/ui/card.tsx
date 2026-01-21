import React from 'react';
import { cn } from "../../lib/utils";

const Card = 
    React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>
    (({className, ...props}, ref) => (
        <div 
            ref = {ref}
            className={cn("rounded-lg border bg-card text-card-title shadow-sm",className)}{...props}
        />
    ));
Card.displayName = "Card";

const CardHeader = 
    React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>
    (({className, ...props}, ref)=>(
        <div
            ref = {ref}
            className = {cn("flex justify-center",className)}{...props}
        />
    ));
CardHeader.displayName = "CardHeader";

const CardTitle =
    React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>
    (({className, ...props}, ref) => (
        <div
            ref = {ref}
            className = {cn("text-2xl font-bold",className)}{...props}
        />
    ));
CardTitle.displayName = "CardTitle";

const CardContent = 
    React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>
    (({className, ...props}, ref) => (
        <div
            ref = {ref}
            className = {cn("p-6 pt-0",className)}{...props}
        />
    ));
CardContent.displayName = "CardContent";

export { Card, CardHeader, CardTitle, CardContent };