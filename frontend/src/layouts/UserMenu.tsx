import { LogOut, UserRound } from "lucide-react";
import { useNavigate } from "react-router";
import { DemoBadge } from "@/components/kaia/badges";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ROLE_LABEL, useAuth } from "@/lib/auth";

export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;
  const initials = user.full_name
    .replace(/^Dr\.\s*/, "")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="grid size-9 place-items-center rounded-full bg-secondary text-sm font-bold text-secondary-foreground ring-2 ring-surface transition hover:ring-lavender" aria-label="Account menu">
          {initials || <UserRound className="size-4" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <div className="px-2.5 py-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{user.full_name}</p>
            {user.is_demo && <DemoBadge />}
          </div>
          <p className="text-xs text-muted-foreground">{user.email}</p>
          <p className="mt-1 text-xs font-medium text-primary">
            {ROLE_LABEL[user.role]}
            {user.organization ? ` · ${user.organization.name}` : ""}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await logout();
            navigate("/login");
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
