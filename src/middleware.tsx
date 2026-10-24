import { NextRequest, NextResponse } from 'next/server'

const openPages = ['/login', '/register']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (openPages.includes(pathname)) {
    return NextResponse.next()
  }
  const token = request.cookies.get('session')?.value
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
