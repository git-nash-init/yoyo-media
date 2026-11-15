import Image from "next/image";
import Link from "next/link";

/** Site logo. Assets live in public/brand/ (icon.svg is the mark, used for favicon and player watermark too). */
export function Logo({ href = "/", size = 32, withText = true }: { href?: string | null; size?: number; withText?: boolean }) {
  const inner = (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Image src="/brand/icon.svg" alt="" width={size} height={size} priority unoptimized className="shrink-0" />
      {withText ? (
        <span className="whitespace-nowrap text-lg font-medium text-fg">YoYo Videos</span>
      ) : null}
    </span>
  );
  return href ? (
    <Link href={href} aria-label="YoYo Videos home" className="inline-flex">
      {inner}
    </Link>
  ) : (
    inner
  );
}
