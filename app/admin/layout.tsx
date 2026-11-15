import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { AdminNav } from "@/components/admin/AdminNav";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · YoYo Videos" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Pages, actions and route handlers each repeat this check; the layout is not the access control.
  const admin = await requireAdmin();
  return (
    <div className="min-h-dvh bg-bg lg:flex">
      <AdminNav adminName={admin.name} />
      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
