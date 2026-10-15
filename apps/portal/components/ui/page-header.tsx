import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  showSidebarTrigger?: boolean;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  showSidebarTrigger = false,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center gap-2 border-b px-3",
        className
      )}
    >
      {showSidebarTrigger && (
        <>
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-3" />
        </>
      )}
      <h1 className="text-lg font-semibold">{title}</h1>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </header>
  );
}
