import { NextRequest, NextResponse } from 'next/server'
import userId from '@/sorse/userId'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const id = await userId()
  if (!id) return NextResponse.json({ detail: 'Нужно войти' }, { status: 401 })
  const text = request.nextUrl.searchParams.get('text')?.trim() ?? ''
  if (!text) return NextResponse.json({ detail: 'Нет текста' }, { status: 400 })
  const base = (process.env.TEXT_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
  const token = process.env.TEXT_SERVICE_TOKEN || 'dev-service-token'
  try {
    const response = await fetch(`${base}/v1/tts?text=${encodeURIComponent(text)}`, {
      headers: { 'X-Service-Token': token },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) {
      return NextResponse.json({ detail: 'Не удалось озвучить слово' }, { status: response.status })
    }
    return new NextResponse(await response.arrayBuffer(), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return NextResponse.json({ detail: 'Сервис озвучки недоступен' }, { status: 502 })
  }
}
