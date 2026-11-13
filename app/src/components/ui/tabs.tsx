// shadcn/ui Tabs, adapted to this repo: Radix supplies the tab semantics and keyboard handling, while the
// masthead's almanac skin still comes from `.tabs` / `.tab` in App.css.
import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/**
 * The root wraps the whole shell here (header and the views), so it stays a plain layout wrapper: the `data-slot`
 * skin belongs to the list, the triggers and the content panel, not to the shell around the app.
 */
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root className={cn("flex flex-col", className)} {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List data-slot="tabs-list" className={cn("inline-flex items-center", className)} {...props} />;
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap outline-none disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The panel wraps the app's existing views, so it carries no `data-slot`: the scoped reset in `shadcn.css` must not
 * treat the app's markup as a shadcn element. Its `contents` class keeps the views' flex layout.
 */
function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("flex-1 outline-none", className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
