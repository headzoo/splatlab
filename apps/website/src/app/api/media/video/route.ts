import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { VIDEO_MAX_DURATION_MS, VIDEO_MULTIPART_MAX_BYTES } from "@/lib/blob-path";
import { hasBlobStore, isBlobStorageConfigError } from "@/lib/blob-store";
import { VideoTranscodeError, VideoTranscoder } from "@/lib/video-transcode";
import { createVideoUploadService } from "@/lib/video-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Leave headroom for request parsing and deterministic cleanup.
export const maxDuration = 45;

const stringField = z.string().trim().min(1).max(80);
const integerField = z.coerce.number().int();
const metadataSchema = z.object({
  gameId: stringField.optional(),
  durationMs: integerField
    .min(1)
    .max(VIDEO_MAX_DURATION_MS + 2_500)
    .transform((value) => Math.min(VIDEO_MAX_DURATION_MS, value)),
  width: integerField.min(2).max(1_920),
  height: integerField.min(2).max(1_920),
});
const transcoder = new VideoTranscoder();
const uploadService = createVideoUploadService((source, dimensions, signal, sourceMeta) =>
  transcoder.transcode(source, dimensions, signal, sourceMeta),
);

function formString(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return NextResponse.json(
      { message: "Sign in to save a video." },
      { status: 401 },
    );
  }
  if (!hasBlobStore()) {
    return NextResponse.json(
      { message: "Video storage isn't configured on this server. Connect the Vercel Blob store and redeploy." },
      { status: 503 },
    );
  }

  const contentLength = request.headers.get("content-length");
  if (
    contentLength !== null &&
    (!/^\d+$/.test(contentLength) ||
      Number(contentLength) > VIDEO_MULTIPART_MAX_BYTES)
  ) {
    return NextResponse.json(
      { message: "That video capture is too large to save." },
      { status: 413 },
    );
  }

  const form = await request.formData().catch(() => null);
  const source = form?.get("video");
  const poster = form?.get("poster");
  const metadata = form
    ? metadataSchema.safeParse({
        gameId: formString(form, "gameId"),
        durationMs: formString(form, "durationMs"),
        width: formString(form, "width"),
        height: formString(form, "height"),
      })
    : null;

  if (!form || !(source instanceof File) || !(poster instanceof File) || !metadata?.success) {
    return NextResponse.json(
      { message: "That video capture was not valid." },
      { status: 400 },
    );
  }

  try {
    const result = await uploadService.save(session.user.id, {
      source,
      poster,
      ...metadata.data,
      signal: request.signal,
    });
    if (result.status === "invalid") {
      return NextResponse.json({ message: "That video capture was not valid." }, { status: 400 });
    }
    if (result.status === "limit") {
      return NextResponse.json(
        { message: "Your video library is full. Delete a video to save another." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { media: result.media },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(
      "Failed to save video",
      error,
      error instanceof VideoTranscodeError && error.stderr ? error.stderr : "",
    );
    if (isBlobStorageConfigError(error)) {
      return NextResponse.json({ message: error.message }, { status: 503 });
    }
    if (error instanceof VideoTranscodeError) {
      return NextResponse.json(
        { message: error.code === "timeout" ? "That video took too long to convert." : "We couldn't convert that video." },
        { status: error.code === "timeout" ? 504 : 422 },
      );
    }
    return NextResponse.json(
      { message: "We couldn't save that video." },
      { status: 500 },
    );
  }
}
