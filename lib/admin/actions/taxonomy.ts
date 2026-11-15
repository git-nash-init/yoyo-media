"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth/guards";
import { saveUploadedImage } from "@/lib/storage";
import { fieldErrorsOf, idSchema, isValidSlug, resolveSlug, taxonomySchema, type ActionResult } from "@/lib/admin/logic";
import { formFile, formText, removeFileQuietly, slugTaken } from "@/lib/admin/server";

const kindSchema = z.enum(["channel", "model", "series"]);
type Kind = z.infer<typeof kindSchema>;

const LIST_PATH: Record<Kind, string> = { channel: "/admin/channels", model: "/admin/models", series: "/admin/series" };
const LABEL: Record<Kind, string> = { channel: "Channel", model: "Model", series: "Series" };
const BAD_INPUT: ActionResult = { ok: false, error: "The request was not valid. Reload the page and try again." };

function revalidateKind(kind: Kind, id?: string) {
  revalidatePath("/admin");
  revalidatePath(LIST_PATH[kind]);
  if (id) revalidatePath(`${LIST_PATH[kind]}/${id}`);
  revalidatePath("/", "layout");
}

async function currentImage(kind: Kind, id: string): Promise<{ image: string | null } | null> {
  if (kind === "channel") {
    const r = await prisma.channel.findUnique({ where: { id }, select: { logoPath: true } });
    return r ? { image: r.logoPath } : null;
  }
  if (kind === "model") {
    const r = await prisma.model.findUnique({ where: { id }, select: { photoPath: true } });
    return r ? { image: r.photoPath } : null;
  }
  const r = await prisma.series.findUnique({ where: { id }, select: { posterPath: true } });
  return r ? { image: r.posterPath } : null;
}

/**
 * Create (id = null) or update a channel, model or series.
 * Form fields: name, slug, description, sortOrder (channel), channelId (series), image, removeImage.
 */
export async function saveTaxonomyAction(
  kind: Kind,
  id: string | null,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  const k = kindSchema.safeParse(kind);
  if (!k.success || (id !== null && !idSchema.safeParse(id).success)) return BAD_INPUT;

  const parsed = taxonomySchema.safeParse({
    name: formText(formData, "name"),
    slug: formText(formData, "slug"),
    description: formText(formData, "description"),
    sortOrder: formText(formData, "sortOrder"),
    channelId: formText(formData, "channelId"),
  });
  const fail = (fieldErrors: Record<string, string>): ActionResult => ({
    ok: false,
    error: "Some fields need attention. Fix the highlighted fields and save again.",
    fieldErrors,
  });
  if (!parsed.success) return fail(fieldErrorsOf(parsed.error));
  const v = parsed.data;

  const slug = resolveSlug(v.slug, v.name);
  if (!isValidSlug(slug)) return fail({ slug: "Use lowercase letters, numbers and hyphens only." });
  if (await slugTaken(kind, slug, id)) {
    return fail({ slug: `“${slug}” is already used by another ${LABEL[kind].toLowerCase()}. Choose a different slug.` });
  }
  if (kind === "series" && v.channelId && !(await prisma.channel.count({ where: { id: v.channelId } }))) {
    return fail({ channelId: "That channel no longer exists. Pick another one." });
  }

  const existing = id ? await currentImage(kind, id) : null;
  if (id && !existing) return { ok: false, error: `This ${LABEL[kind].toLowerCase()} no longer exists. It may have been deleted in another tab.` };

  // Image: validated by magic bytes and stored under a server-generated name.
  let image = existing?.image ?? null;
  const file = formFile(formData, "image");
  let uploaded: string | null = null;
  if (file) {
    const saved = await saveUploadedImage(file, "images");
    if ("error" in saved) return fail({ image: saved.error });
    uploaded = saved.path;
    image = saved.path;
  } else if (formText(formData, "removeImage") === "on") {
    image = null;
  }

  let savedId: string;
  try {
    if (kind === "channel") {
      const data = { name: v.name, slug, description: v.description, sortOrder: v.sortOrder, logoPath: image };
      savedId = (id ? await prisma.channel.update({ where: { id }, data }) : await prisma.channel.create({ data })).id;
    } else if (kind === "model") {
      const data = { name: v.name, slug, bio: v.description, photoPath: image };
      savedId = (id ? await prisma.model.update({ where: { id }, data }) : await prisma.model.create({ data })).id;
    } else {
      const data = { title: v.name, slug, description: v.description, channelId: v.channelId, posterPath: image };
      savedId = (id ? await prisma.series.update({ where: { id }, data }) : await prisma.series.create({ data })).id;
    }
  } catch (e) {
    await removeFileQuietly(uploaded);
    throw e;
  }

  if (existing?.image && existing.image !== image) await removeFileQuietly(existing.image);

  await audit(admin.id, `${kind}.${id ? "update" : "create"}`, `${kind}:${savedId}`, { slug, name: v.name });
  revalidateKind(kind, savedId);
  if (!id) redirect(`${LIST_PATH[kind]}?created=1`);
  return { ok: true, message: `${LABEL[kind]} saved.` };
}

/** Videos keep existing; they are just detached (the database sets their link to null). */
export async function deleteTaxonomyAction(kind: Kind, id: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!kindSchema.safeParse(kind).success || !idSchema.safeParse(id).success) return BAD_INPUT;

  const existing = await currentImage(kind, id);
  if (!existing) return { ok: false, error: `This ${LABEL[kind].toLowerCase()} was already deleted.` };

  if (kind === "channel") await prisma.channel.delete({ where: { id } });
  else if (kind === "model") await prisma.model.delete({ where: { id } });
  else await prisma.series.delete({ where: { id } });

  await removeFileQuietly(existing.image);
  await audit(admin.id, `${kind}.delete`, `${kind}:${id}`);
  revalidateKind(kind);
  redirect(`${LIST_PATH[kind]}?deleted=1`);
}
