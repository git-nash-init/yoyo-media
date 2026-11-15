import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/guards";
import { channelLogoUrl, modelPhotoUrl, seriesPosterUrl } from "@/lib/media/urls";
import { firstParam, idSchema } from "@/lib/admin/logic";
import { type DateRange, dateWhere, isRangeActive, parseDateRange } from "@/lib/admin/dateRange";
import { DateEmptyState, DateFilterBar } from "@/components/admin/DateFilter";
import { Alert, ButtonLink, Card, cn } from "@/components/ui";
import { EmptyState } from "@/components/states";
import { PageHeader, Table, Td, Th, Thumb, fmtDate } from "@/components/admin/ui";
import { ActionButton } from "@/components/admin/client";
import { TaxonomyForm, type TaxonomyKind } from "@/components/admin/TaxonomyForm";
import { deleteTaxonomyAction } from "@/lib/admin/actions/taxonomy";

type SearchParams = Record<string, string | string[] | undefined>;

const META: Record<
  TaxonomyKind,
  { path: string; title: string; one: string; description: string; newLabel: string; emptyReason: string; deleteNote: string }
> = {
  channel: {
    path: "/admin/channels",
    title: "Channels",
    one: "channel",
    description: "Channels are the site's own content categories. Every video can belong to one channel.",
    newLabel: "New channel",
    emptyReason: "Channels group your videos into categories that viewers can browse and follow. Create the first one to start organising.",
    deleteNote: "Its videos and series are kept and become channel-less. Followers of this channel lose the follow.",
  },
  model: {
    path: "/admin/models",
    title: "Models",
    one: "model",
    description: "People who appear in your videos. Tag them on a video so viewers can browse and follow them.",
    newLabel: "Add model",
    emptyReason: "No models have been added. Add the people who appear in your videos, then tag them on each video.",
    deleteNote: "Videos are kept; this model is just removed from them. Followers of this model lose the follow.",
  },
  series: {
    path: "/admin/series",
    title: "Series",
    one: "series",
    description: "A series groups episodes in order. Assign videos to a series and give each an episode number.",
    newLabel: "New series",
    emptyReason: "No series yet. Create one, then assign videos to it from each video's edit page.",
    deleteNote: "Its episodes are kept as standalone videos.",
  },
};

type Row = { id: string; name: string; slug: string; image: string; videos: number; extra: string; createdAt: Date };

async function loadRows(kind: TaxonomyKind, range: DateRange): Promise<Row[]> {
  const where = dateWhere("createdAt", range);
  if (kind === "channel") {
    const rows = await prisma.channel.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { videos: true, series: true, follows: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      image: channelLogoUrl(c),
      videos: c._count.videos,
      extra: `${c._count.series} series · ${c._count.follows} followers · order ${c.sortOrder}`,
      createdAt: c.createdAt,
    }));
  }
  if (kind === "model") {
    const rows = await prisma.model.findMany({ where, orderBy: { name: "asc" }, include: { _count: { select: { videos: true, follows: true } } } });
    return rows.map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
      image: modelPhotoUrl(m),
      videos: m._count.videos,
      extra: `${m._count.follows} followers`,
      createdAt: m.createdAt,
    }));
  }
  const rows = await prisma.series.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { videos: true } }, channel: { select: { name: true } } },
  });
  return rows.map((s) => ({
    id: s.id,
    name: s.title,
    slug: s.slug,
    image: seriesPosterUrl(s),
    videos: s._count.videos,
    extra: s.channel?.name ?? "No channel",
    createdAt: s.createdAt,
  }));
}

export async function TaxonomyListPage({ kind, searchParams }: { kind: TaxonomyKind; searchParams: SearchParams }) {
  await requireAdmin();
  const meta = META[kind];
  const range = parseDateRange(searchParams);
  const rows = await loadRows(kind, range);
  const created = firstParam(searchParams.created) === "1";
  const deleted = firstParam(searchParams.deleted) === "1";

  return (
    <>
      <PageHeader title={meta.title} description={meta.description} actions={<ButtonLink href={`${meta.path}/new`}>{meta.newLabel}</ButtonLink>} />
      {created ? (
        <div className="mb-4">
          <Alert tone="success">
            Created. Next: open a video and assign it to this {meta.one}.{" "}
            <Link href="/admin/videos" className="font-medium underline">
              Go to videos
            </Link>
          </Alert>
        </div>
      ) : null}
      {deleted ? (
        <div className="mb-4">
          <Alert tone="success">Deleted. Videos that were linked to it were kept.</Alert>
        </div>
      ) : null}

      <DateFilterBar range={range} caption="Filtered by the date it was created" />

      {rows.length === 0 && isRangeActive(range) ? (
        <DateEmptyState noun={`${meta.title.toLowerCase()} created`} range={range} clearHref={meta.path} />
      ) : rows.length === 0 ? (
        <EmptyState icon="🗂️" title={`No ${meta.title.toLowerCase()} yet`} reason={meta.emptyReason} actionHref={`${meta.path}/new`} actionLabel={meta.newLabel} />
      ) : (
        <Table label={meta.title}>
          <thead>
            <tr>
              <Th>{kind === "series" ? "Series" : "Name"}</Th>
              <Th>Slug</Th>
              <Th className="text-right">Videos</Th>
              <Th>{kind === "series" ? "Channel" : "Details"}</Th>
              <Th>Created</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-surface-2/40">
                <Td>
                  <Link href={`${meta.path}/${r.id}`} className="flex items-center gap-3">
                    <Thumb src={r.image} className={cn("shrink-0", kind === "series" ? "h-10 w-[4.5rem] rounded-md" : "h-10 w-10 rounded-full")} />
                    <span className="max-w-[16rem] truncate font-medium text-fg">{r.name}</span>
                  </Link>
                </Td>
                <Td className="font-mono text-xs text-muted">{r.slug}</Td>
                <Td className="text-right tabular-nums">{r.videos.toLocaleString("en-IN")}</Td>
                <Td className="text-muted">{r.extra}</Td>
                <Td className="whitespace-nowrap text-muted">{fmtDate(r.createdAt)}</Td>
                <Td>
                  <div className="flex flex-wrap items-start justify-end gap-2">
                    <ButtonLink href={`${meta.path}/${r.id}`} variant="secondary" size="sm">
                      Edit
                    </ButtonLink>
                    <ActionButton
                      action={deleteTaxonomyAction.bind(null, kind, r.id)}
                      variant="danger"
                      confirm={`Delete "${r.name}"? ${meta.deleteNote} This cannot be undone.`}
                      confirmLabel="Yes, delete"
                      pendingLabel="Deleting…"
                    >
                      Delete
                    </ActionButton>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

async function channelOptions() {
  return prisma.channel.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
}

export async function TaxonomyNewPage({ kind }: { kind: TaxonomyKind }) {
  await requireAdmin();
  const meta = META[kind];
  const channels = kind === "series" ? await channelOptions() : [];
  return (
    <>
      <p className="mb-3 text-sm">
        <Link href={meta.path} className="text-muted hover:text-fg">
          ← Back to {meta.title.toLowerCase()}
        </Link>
      </p>
      <PageHeader title={meta.newLabel} description={meta.description} />
      <TaxonomyForm kind={kind} channels={channels} />
    </>
  );
}

export async function TaxonomyEditPage({ kind, id }: { kind: TaxonomyKind; id: string }) {
  await requireAdmin();
  const meta = META[kind];

  let item: { id: string; name: string; slug: string; description: string; sortOrder: number; channelId: string; hasImage: boolean } | null = null;
  let imageUrl = "";
  let videos = 0;
  if (idSchema.safeParse(id).success) {
    if (kind === "channel") {
      const c = await prisma.channel.findUnique({ where: { id }, include: { _count: { select: { videos: true } } } });
      if (c) {
        item = { id: c.id, name: c.name, slug: c.slug, description: c.description ?? "", sortOrder: c.sortOrder, channelId: "", hasImage: Boolean(c.logoPath) };
        imageUrl = `${channelLogoUrl(c)}?v=${encodeURIComponent(c.logoPath ?? "")}`;
        videos = c._count.videos;
      }
    } else if (kind === "model") {
      const m = await prisma.model.findUnique({ where: { id }, include: { _count: { select: { videos: true } } } });
      if (m) {
        item = { id: m.id, name: m.name, slug: m.slug, description: m.bio ?? "", sortOrder: 0, channelId: "", hasImage: Boolean(m.photoPath) };
        imageUrl = `${modelPhotoUrl(m)}?v=${encodeURIComponent(m.photoPath ?? "")}`;
        videos = m._count.videos;
      }
    } else {
      const s = await prisma.series.findUnique({ where: { id }, include: { _count: { select: { videos: true } } } });
      if (s) {
        item = { id: s.id, name: s.title, slug: s.slug, description: s.description ?? "", sortOrder: 0, channelId: s.channelId ?? "", hasImage: Boolean(s.posterPath) };
        imageUrl = `${seriesPosterUrl(s)}?v=${encodeURIComponent(s.posterPath ?? "")}`;
        videos = s._count.videos;
      }
    }
  }

  if (!item) {
    return (
      <EmptyState
        icon="🔎"
        title={`${meta.one[0].toUpperCase()}${meta.one.slice(1)} not found`}
        reason="It may have been deleted, or the link is wrong."
        actionHref={meta.path}
        actionLabel={`Back to ${meta.title.toLowerCase()}`}
      />
    );
  }

  const channels = kind === "series" ? await channelOptions() : [];

  return (
    <>
      <p className="mb-3 text-sm">
        <Link href={meta.path} className="text-muted hover:text-fg">
          ← Back to {meta.title.toLowerCase()}
        </Link>
      </p>
      <PageHeader title={item.name} description={`${videos.toLocaleString("en-IN")} ${videos === 1 ? "video" : "videos"} linked to this ${meta.one}.`} />
      <TaxonomyForm kind={kind} item={item} imageUrl={imageUrl} channels={channels} />

      <Card className="mt-6 max-w-2xl space-y-3 border-danger/30 p-5">
        <h2 className="text-base font-medium text-fg">Delete {meta.one}</h2>
        <p className="text-sm text-muted">{meta.deleteNote} This cannot be undone.</p>
        <ActionButton
          action={deleteTaxonomyAction.bind(null, kind, item.id)}
          variant="danger"
          size="md"
          confirm={`Delete "${item.name}"? This cannot be undone.`}
          confirmLabel="Yes, delete"
          pendingLabel="Deleting…"
        >
          Delete {meta.one}
        </ActionButton>
      </Card>
    </>
  );
}
