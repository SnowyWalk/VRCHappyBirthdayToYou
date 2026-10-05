import Link from "next/link";
import { Sparkles } from "lucide-react";
export function Brand({
  onClick,
}: {
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
}) {
  return (
    <Link href="/" className="brand" onClick={onClick}>
      <span className="brand-icon">
        <Sparkles size={20} />
      </span>
      <span>Birthday World</span>
    </Link>
  );
}
