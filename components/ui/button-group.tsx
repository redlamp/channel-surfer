import { cn } from "@/lib/utils";

export function ButtonGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div role="group" data-slot="button-group" className={cn("inline-flex w-fit items-center [&>[data-slot=button]]:rounded-none [&>[data-slot=button]:first-child]:rounded-l-md [&>[data-slot=button]:last-child]:rounded-r-md [&>[data-slot=button]+[data-slot=button]]:-ml-px", className)} {...props} />;
}
