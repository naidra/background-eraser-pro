import { Scissors } from "lucide-react";

export default function NavBar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Scissors className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-foreground">BG Remover</span>
        </div>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span className="hidden sm:inline rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            100% Free
          </span>
        </div>
      </div>
    </nav>
  );
}
