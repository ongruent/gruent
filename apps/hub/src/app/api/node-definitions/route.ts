import { readManifest } from '@gruent/hub/lib/server/nodeLibrary'
import { NextResponse } from 'next/server'

// Read at request time so newly published definitions appear without rebuilding the hub.
export const dynamic = 'force-dynamic'

export const GET = async () => {
  try {
    return NextResponse.json(await readManifest(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return NextResponse.json({ errors: [(e as Error).message] }, { status: 500 })
  }
}
