import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { parseKeyId } from "@/lib/client/musicKey";
import { ensureSchema } from "@/lib/schema";

// Backfills a track's musical key from the browser: when the Studio
// detects a key on a lane (see autoMatch.ts) and the track doesn't have
// one yet, the browser POSTs it here. Idempotent — a key is only ever set
// when the track hasn't got one, so a hand-picked key stays and two
// browsers detecting at once won't fight.
//
// Stems are public (see /api/audio/stem), so a backfill isn't restricted:
// any signed-in person is listening to the song anyway, and the UPDATE
// has no effect if the track already has a key.

const bodySchema = z.object({
  key: z.string().regex(/^(\d|10|11)[Mm]$/),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid key" }, { status: 400 });

  const key = parseKeyId(parsed.data.key)!;
  await ensureSchema();
  // Stored the way /api/tracks/[id]/key keeps it ("9:minor").
  const rows = await sql<{ track_id: string }[]>`
    UPDATE tracks SET music_key = ${`${key.tonic}:${key.mode}`}
    WHERE id = (SELECT track_id FROM stems WHERE id = ${id})
      AND music_key IS NULL
    RETURNING id AS track_id
  `;
  return NextResponse.json({ ok: true, updated: rows.length === 1 });
}
