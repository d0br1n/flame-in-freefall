"use client";

// The one link component for internal links. It carries the visitor's chosen cabin air
// (?air=<id>) onto the target URL, so the choice survives navigation (logic: lib/links.ts).
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, type ComponentProps } from "react";
import { withAir } from "@/lib/links";

type Props = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

function LinkWithAir({ href, ...rest }: Props) {
  const searchParams = useSearchParams();
  return <Link href={withAir(href, searchParams)} {...rest} />;
}

/**
 * Renders a plain link while the URL is not known yet (prerendering), then the same link with the
 * current `air` parameter. Usable anywhere without a Suspense boundary of its own.
 */
export function AppLink(props: Props) {
  return (
    <Suspense fallback={<Link {...props} />}>
      <LinkWithAir {...props} />
    </Suspense>
  );
}
