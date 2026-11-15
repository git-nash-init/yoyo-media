import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FollowButton } from "@/components/video/FollowButton";
import { Pagination } from "@/components/video/Pagination";
import { VideoGrid } from "@/components/video/VideoGrid";
import { EmptyState } from "@/components/states";
import { ButtonLink } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { formatINR } from "@/lib/format";
import { getModelBySlug } from "@/lib/queries/catalog";
import { isFollowingModel } from "@/lib/queries/follows";
import { parsePage } from "@/lib/queries/pagination";
import { listModelVideos } from "@/lib/queries/videos";
import { getPlan } from "@/lib/settings";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const model = await getModelBySlug((await params).slug);
  return model
    ? { title: model.name, description: model.bio?.slice(0, 160) ?? `Videos featuring ${model.name}.` }
    : { title: "Model not found" };
}

export default async function ModelPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const model = await getModelBySlug(slug);
  if (!model) notFound();

  const page = parsePage((await searchParams).page);
  const user = await getCurrentUser();
  const path = `/models/${model.slug}`;
  const [videos, following, plan] = await Promise.all([
    listModelVideos(model.id, page),
    isFollowingModel(user?.id, model.id),
    user?.isSubscriber ? Promise.resolve(null) : getPlan(),
  ]);

  return (
    <div className="pb-8">
      {/* Hero */}
      <header className="relative isolate overflow-hidden border-b border-line">
        {/* Soft, blurred backdrop made from the model's own photo */}

        <div className="mx-auto flex max-w-[1600px] flex-col items-center gap-6 px-4 py-10 text-center md:flex-row md:items-end md:gap-10 md:py-14 md:text-left lg:px-6">
          <div className="relative shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={model.photo}
              alt={`Photo of ${model.name}`}
              width={320}
              height={320}
              decoding="async"
              className="relative h-44 w-44 rounded-full border border-line bg-surface-2 object-cover sm:h-56 sm:w-56 lg:h-64 lg:w-64"
            />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-accent">Model</p>
            <h1 className="mt-1 font-display text-5xl text-fg sm:text-6xl">{model.name}</h1>

            <dl className="mt-5 flex justify-center gap-8 md:justify-start">
              <div className="flex flex-col-reverse">
                <dt className="text-xs font-medium text-muted">
                  {model.videoCount === 1 ? "Video" : "Videos"}
                </dt>
                <dd className="text-2xl font-medium tabular-nums text-fg">{model.videoCount}</dd>
              </div>
              <div className="flex flex-col-reverse">
                <dt className="text-xs font-medium text-muted">
                  {model.followerCount === 1 ? "Follower" : "Followers"}
                </dt>
                <dd className="text-2xl font-medium tabular-nums text-fg">{model.followerCount}</dd>
              </div>
            </dl>

            {model.bio ? (
              <p className="mx-auto mt-5 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-fg/90 md:mx-0">
                {model.bio}
              </p>
            ) : null}

            <div className="mt-6 flex justify-center md:justify-start">
              <FollowButton
                kind="model"
                targetId={model.id}
                name={model.name}
                initialFollowing={following}
                signedIn={!!user}
                loginNext={path}
                size="lg"
                className="min-w-40"
              />
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] space-y-8 px-4 pt-8 lg:px-6">
        {plan ? (
          <aside
            aria-label="Subscribe"
            className="flex flex-col items-start gap-4 rounded-xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:p-6"
          >
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-medium text-fg">Watch every video from {model.name}</h2>
              <p className="mt-1 text-sm text-muted">
                One plan covers the full library, shorts and downloads: {formatINR(plan.pricePaise)} for {plan.days} days.
              </p>
            </div>
            <ButtonLink
              href={user ? `/subscribe?next=${encodeURIComponent(path)}` : `/register?next=${encodeURIComponent(path)}`}
              size="lg"
              className="shrink-0"
            >
              Subscribe for {formatINR(plan.pricePaise)}
            </ButtonLink>
          </aside>
        ) : null}

        <section aria-labelledby="model-videos-heading">
          <h2 id="model-videos-heading" className="mb-4 text-lg font-medium text-fg sm:text-xl">
            Videos with {model.name}
          </h2>
          {videos.info.total === 0 ? (
            <EmptyState
              title="No videos yet"
              reason={`Videos featuring ${model.name} will show up here as soon as our team publishes them.`}
              actionHref="/models"
              actionLabel="Browse models"
            />
          ) : (
            <>
              <VideoGrid videos={videos.items} />
              <Pagination page={videos.info.page} totalPages={videos.info.totalPages} basePath={path} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
