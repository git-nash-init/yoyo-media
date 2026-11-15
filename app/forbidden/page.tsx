import type { Metadata } from "next";
import { Logo } from "@/components/brand/Logo";
import { PermissionDenied } from "@/components/states";

export const metadata: Metadata = { title: "Administrators only", robots: { index: false } };

export default function ForbiddenPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4">
      <div>
        <div className="flex justify-center">
          <Logo />
        </div>
        <PermissionDenied
          title="This area is for administrators"
          reason="The page you tried to open is used by the YoYo team to manage videos and members. Your account doesn't have administrator access, so we've stopped here. Your subscription and everything else on your account are unaffected."
          actionHref="/browse"
          actionLabel="Back to browsing"
          secondaryHref="/account"
          secondaryLabel="My account"
        />
      </div>
    </main>
  );
}
