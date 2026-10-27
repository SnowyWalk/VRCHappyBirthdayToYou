import Image from "next/image";
import assets from "@/lib/assets.json";

// Front view of the stage board (artifacts/publish-images.mjs) with the
// "YOUR NAME" placeholder painted out. In the 880×420 image the board interior
// spans x 111–748 and the name is centred at y 270; the page shows the bottom
// 260px, so CSS places the text at 12.6%/72.4% wide and 42.3% from the top.
// The world draws the name in cream (240, 221, 187).
export function NameSign({ name }: { name: string }) {
  const text = name.trim();
  return (
    <figure className="name-sign" aria-hidden="true">
      <Image src={assets.stageSign} alt="" fill priority unoptimized sizes="440px" />
      {/* An empty name clears the line in the world, so the preview stays blank too. */}
      <span className="name-sign-text">{text}</span>
    </figure>
  );
}
