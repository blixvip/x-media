import { createGitHubTrendingObserver } from '../../../lib/github-trending';

const observe = createGitHubTrendingObserver();
export async function GET() {
  return Response.json(await observe(), { headers: { 'cache-control': 'public, max-age=60' } });
}
