import { rfidPrimaryEnabled } from '@/lib/server/operationalStore';
export async function GET() {
  return Response.json({ primary: rfidPrimaryEnabled() }, { headers: { 'Cache-Control': 'no-store' } });
}
