import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** KAIA buttons: squared-off (10px), never pill. Pills are reserved for chips and tags. */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-btn text-sm font-semibold transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "bg-secondary text-secondary-foreground hover:bg-lavender/55",
        outline: "border border-input bg-surface text-foreground hover:border-primary/40 hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        subtle: "bg-primary-soft text-primary hover:bg-secondary",
        success: "bg-success text-white hover:bg-[#426754]",
        priority: "bg-priority text-white hover:bg-[#74343e]",
        navy: "bg-charcoal text-white hover:bg-[#111827]",
        link: "h-auto px-0 font-semibold text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 rounded-[0.5rem] px-3 text-[13px]",
        default: "h-11 px-4",
        lg: "h-12 px-6 text-[15px]",
        icon: "size-11",
        "icon-sm": "size-9 rounded-[0.5rem]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
