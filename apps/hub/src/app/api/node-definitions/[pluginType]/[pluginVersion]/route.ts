import { readDefinition } from '@gruent/hub/lib/server/nodeLibrary'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type Params = { pluginType: string; pluginVersion: string }

/**
 * Serves the original node.json bytes for an exact identity. The client verifies them against the manifest
 * digest and validates them against the contract; this route never substitutes another version.
 */
export const GET = async (_req: NextRequest, { params }: { params: Promise<Params> }) => {
  const { pluginType, pluginVersion } = await params
  const version = Number(pluginVersion)
  if (!/^[a-z][a-z0-9-]*$/.test(pluginType) || !/^[1-9]\d*$/.test(pluginVersion))
    return NextResponse.json({ errors: ['invalid plugin identity'] }, { status: 400 })

  try {
    const bytes = await readDefinition(pluginType, version)
    if (!bytes)
      return NextResponse.json(
        { errors: [`${pluginType}@${version}: plugin version not available`] },
        { status: 404 },
      )
    return new NextResponse(new Uint8Array(bytes), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    })
  } catch (e) {
    return NextResponse.json({ errors: [(e as Error).message] }, { status: 500 })
  }
}
