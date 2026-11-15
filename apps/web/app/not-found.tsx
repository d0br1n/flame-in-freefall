import { AppLink } from "@/components/AppLink";
import { PageTitle } from "@/components/shell/ShellState";
import { EmptyState } from "@/components/ui/EmptyState";

export default function NotFound() {
  return (
    <div className="mx-auto w-full max-w-[60rem]">
      <PageTitle title="Page not found" />
      <EmptyState icon="search" title="Nothing at this address">
        <p>
          <AppLink href="/">Go to the Overview</AppLink> or <AppLink href="/investigations">see the investigations</AppLink>.
        </p>
      </EmptyState>
    </div>
  );
}
