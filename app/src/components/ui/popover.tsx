// shadcn/ui Popover, kept to this repo's budget: the per-primitive Radix package, no animation library, and a box
// that sits above the app's dialogs as the Select's list does (they stack at z-index 100, see `.modal-backdrop` in
// App.css).
import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

function Popover({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

/**
 * The box the trigger opens. It opens under the trigger, from its left edge, as the Select's list does: its contents
 * are wider than the small buttons of a profile.
 */
function PopoverContent({
  className,
  align = "start",
  sideOffset = 2,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-[120] w-72 origin-(--radix-popover-content-transform-origin) rounded-md border bg-popover text-popover-foreground shadow-md outline-hidden",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
