// Every page arrives with the same short entrance (redesign motion language, app/globals.css
// `.page-enter`; off with reduced motion). A template re-mounts on navigation, a layout does not.
import type { ReactNode } from "react";

export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-enter grid min-h-0 pt-5 sm:pt-6 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] content-start">{children}</div>;
}
