'use client';

import { Calendar, Compass, Users, Coffee, Search, Bell, Settings, Shield, LogOut, UserPen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const navItems = [
  { title: 'Discover', url: '/user/discover', icon: Compass },
  { title: 'My Events', url: '/user/events', icon: Calendar },
  { title: 'Directory', url: '/user/directory', icon: Users },
];

export function TopNav() {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <TooltipProvider delayDuration={0}>
      <header className="sticky top-0 z-50 h-14 bg-amber-50/60 backdrop-blur-xl backdrop-saturate-150 dark:bg-stone-950/70">
        {/* Subtle warm bottom edge */}
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-amber-200/60 to-transparent dark:via-white/10" />

        <div className="flex h-full items-center justify-between px-4 sm:px-6">
          {/* Left section: Logo + Nav */}
          <div className="flex items-center">
            {/* Logo */}
            <Link
              href="/user/discover"
              className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-all hover:bg-stone-100/80 dark:hover:bg-white/5"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-600 to-orange-700 shadow-sm shadow-amber-500/25">
                <Coffee className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
              </div>
              <span className="hidden text-[13px] font-semibold tracking-tight text-stone-800 sm:inline dark:text-stone-200">
                Latte Lab
              </span>
            </Link>

            {/* Nav items */}
            <nav className="ml-5 flex items-center gap-1 sm:ml-7">
              {navItems.map((item) => {
                const isActive = pathname.startsWith(item.url);
                return (
                  <Tooltip key={item.title}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.url}
                        className={cn(
                          'relative flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-all',
                          isActive
                            ? 'bg-stone-900/[0.06] text-stone-900 dark:bg-white/10 dark:text-stone-100'
                            : 'text-stone-500 hover:bg-stone-100/70 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-white/5 dark:hover:text-stone-200'
                        )}
                      >
                        <item.icon className="h-[15px] w-[15px]" strokeWidth={isActive ? 2.25 : 1.75} />
                        <span className="hidden sm:inline">{item.title}</span>
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent className="sm:hidden">
                      {item.title}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </nav>
          </div>

          {/* Right section */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-stone-400 hover:bg-stone-100/70 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-white/5"
                  disabled
                >
                  <Search className="h-[15px] w-[15px]" strokeWidth={2} />
                  <span className="sr-only">Search</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Coming soon</TooltipContent>
            </Tooltip>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative h-8 w-8 rounded-lg text-stone-400 hover:bg-stone-100/70 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-white/5"
                >
                  <Bell className="h-[15px] w-[15px]" strokeWidth={2} />
                  {!session?.user?.profileComplete && (
                    <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-500" />
                  )}
                  <span className="sr-only">Notifications</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-0">
                <div className="border-b px-4 py-3">
                  <p className="text-sm font-medium">Notifications</p>
                </div>
                {!session?.user?.profileComplete ? (
                  <Link href="/user/settings" className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
                      <UserPen className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Complete your profile</p>
                      <p className="text-xs text-muted-foreground">Fill in your details so other members can find you in the directory.</p>
                    </div>
                  </Link>
                ) : (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No notifications
                  </div>
                )}
              </PopoverContent>
            </Popover>

            <div className="ml-1.5 h-5 w-px bg-stone-200/70 dark:bg-white/10" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-1.5 h-8 w-8 rounded-full ring-1 ring-stone-200/60 transition-shadow hover:ring-stone-300/80 dark:ring-white/10 dark:hover:ring-white/20"
                >
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={session?.user?.image || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-amber-100 to-orange-100 text-xs font-medium text-amber-800 dark:from-amber-900/50 dark:to-orange-900/50 dark:text-amber-200">
                      {session?.user?.name
                        ?.split(' ')
                        .map((n) => n[0])
                        .join('') || '?'}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{session?.user?.name}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      {session?.user?.email}
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/user/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                {session?.user?.isAdmin && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin">
                      <Shield className="mr-2 h-4 w-4" />
                      Admin Panel
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
    </TooltipProvider>
  );
}
