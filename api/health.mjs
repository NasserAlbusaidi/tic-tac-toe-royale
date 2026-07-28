export function GET() {
  return Response.json({
    ok: true,
    runtime: 'vercel',
    store: process.env.REDIS_URL ? 'redis' : 'missing',
  })
}
