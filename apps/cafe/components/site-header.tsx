"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { navigation } from "@/content/site";
export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header shell">
      <Link
        href="/"
        className="brand"
        aria-label="Latte Lab home"
        onClick={() => setOpen(false)}
      >
        <Image src="/brand/logo.svg" alt="" width={45} height={45} priority />
        <span>latte lab.</span>
      </Link>
      <button
        className="menu-toggle"
        aria-expanded={open}
        aria-controls="main-nav"
        onClick={() => setOpen(!open)}
      >
        {open ? "Close ✕" : "Menu ☰"}
      </button>
      <nav
        id="main-nav"
        aria-label="Main navigation"
        className={open ? "navigation is-open" : "navigation"}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            document.querySelector<HTMLButtonElement>(".menu-toggle")?.focus();
          }
        }}
      >
        {navigation.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={pathname === item.href ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {item.label}
          </Link>
        ))}
        <Link
          href="/join"
          className="button button-small nav-join"
          aria-current={pathname === "/join" ? "page" : undefined}
          onClick={() => setOpen(false)}
        >
          Join <span aria-hidden="true">↗</span>
        </Link>
      </nav>
    </header>
  );
}
