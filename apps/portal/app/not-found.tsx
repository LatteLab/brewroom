import Image from 'next/image';
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-amber-50/40 px-4 py-16 text-center dark:bg-stone-950">
      <Image src="/apple-icon.png" alt="Latte Lab" width={80} height={80} className="mb-2" />
      <h2 className="text-xl font-semibold">Page not found</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"
      >
        Go home
      </Link>
    </div>
  );
}
