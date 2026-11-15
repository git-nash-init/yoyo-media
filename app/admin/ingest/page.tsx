import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/auth/guards";
import { timeAgo } from "@/lib/format";
import { Badge, Card } from "@/components/ui";
import { PageHeader, SectionTitle, Table, Td, Th, fmtDateTime } from "@/components/admin/ui";
import { dateWhere, isRangeActive, parseDateRange } from "@/lib/admin/dateRange";
import { DateEmptyLine, DateFilterBar } from "@/components/admin/DateFilter";
import { RevokeTokenButton, TokenCreate } from "@/components/admin/TokenCreate";

export const metadata: Metadata = { title: "Ingest tokens" };

export default async function AdminIngestPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const range = parseDateRange(await searchParams);
  const ranged = isRangeActive(range);
  const tokens = await prisma.ingestToken.findMany({
    where: dateWhere("createdAt", range),
    orderBy: { createdAt: "desc" },
    // tokenHash is deliberately not selected: it never leaves the database.
    select: { id: true, name: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });

  return (
    <>
      <PageHeader
        title="Ingest tokens"
        description="YoYo Studio runs on your PC, processes videos and pushes them to this site. It signs in with an ingest token instead of your password."
      />

      <TokenCreate siteUrl={env.APP_URL.replace(/\/+$/, "")} />

      <section className="mt-8">
        <SectionTitle>Tokens</SectionTitle>
        <DateFilterBar range={range} caption="Filtered by the date the token was created" />
        {tokens.length === 0 && ranged ? (
          <Card className="p-5">
            <DateEmptyLine noun="tokens created" range={range} clearHref="/admin/ingest" />
          </Card>
        ) : tokens.length === 0 ? (
          <Card className="p-5 text-sm text-muted">No tokens yet. Create one above, then paste it into YoYo Studio to start pushing videos.</Card>
        ) : (
          <Table label="Ingest tokens">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th>Last used</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id}>
                  <Td className="max-w-[16rem] truncate font-medium">{t.name}</Td>
                  <Td>{t.revokedAt ? <Badge tone="danger">Revoked</Badge> : <Badge tone="success">Active</Badge>}</Td>
                  <Td className="whitespace-nowrap text-muted">{fmtDateTime(t.createdAt)}</Td>
                  <Td className="whitespace-nowrap text-muted">{t.lastUsedAt ? timeAgo(t.lastUsedAt) : "Never"}</Td>
                  <Td>
                    <div className="flex justify-end">
                      {t.revokedAt ? <span className="text-xs text-muted">Revoked {fmtDateTime(t.revokedAt)}</span> : <RevokeTokenButton id={t.id} name={t.name} />}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </>
  );
}
