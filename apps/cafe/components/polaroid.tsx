import Image from "next/image";
import type { CSSProperties } from "react";
export function Polaroid({
  src,
  alt,
  caption,
  rotation = 0,
  priority = false,
}: {
  src: string;
  alt: string;
  caption: string;
  rotation?: number;
  priority?: boolean;
}) {
  return (
    <figure
      className="polaroid"
      style={{ "--rotation": `${rotation}deg` } as CSSProperties}
    >
      <div className="polaroid-image">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 600px) 75vw, 380px"
          priority={priority}
        />
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
