import Link from "next/link";
import Image from "next/image";
export default function NotFound() {
  return (
    <main id="main" className="not-found shell">
      <Image src="/brand/beaver.webp" width={200} height={200} alt="" />
      <p className="eyebrow">404 · AN EMPTY CUP</p>
      <h1>This one’s gone cold.</h1>
      <p>We couldn’t find that page. There’s still plenty brewing back home.</p>
      <Link href="/" className="button">
        Back to Latte Lab ↗
      </Link>
    </main>
  );
}
