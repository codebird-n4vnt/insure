import { BACKEND_URL } from '@/lib/anchor';

/**
 * Solana Actions discovery: maps this site's vault pages to the oracle API's
 * action endpoints, so a shared /vaults/<address> link unfurls as a Blink.
 */
export function GET() {
  return Response.json(
    {
      rules: [
        { pathPattern: '/vaults/*', apiPath: `${BACKEND_URL}/api/actions/vaults/*` },
        { pathPattern: '/api/actions/**', apiPath: `${BACKEND_URL}/api/actions/**` },
      ],
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Content-Encoding, Accept-Encoding',
      },
    }
  );
}

export function OPTIONS() {
  return GET();
}
