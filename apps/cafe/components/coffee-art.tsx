import Image from "next/image";
export function CoffeeArt({ small = false }: { small?: boolean }) {
  return (
    <div
      className={`coffee-art ${small ? "coffee-art-small" : ""}`}
      role="img"
      aria-label="Latte Lab’s beaver enjoying a cup of coffee"
    >
      <div className="art-orbit" />
      <div className="art-disc" />
      <span className="art-star star-one" aria-hidden="true">
        ✳
      </span>
      <span className="art-star star-two" aria-hidden="true">
        ✧
      </span>
      <div className="steam" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <Image
        className="hero-beaver"
        src="/brand/beaver.webp"
        alt=""
        width={620}
        height={620}
        priority
      />
      <Image
        className="floating-bean"
        src="/brand/bean.webp"
        alt=""
        width={70}
        height={70}
      />
      <span className="art-note" aria-hidden="true">
        a little cup of happy <span>⤴</span>
      </span>
      <span className="art-label" aria-hidden="true">
        COFFEE • COMMUNITY • MIT
      </span>
    </div>
  );
}
