// url example:
// https://asianc.to/drama/stream/drama-title/season-1/episode-1/

export type UrlInfo = {
  id: string;
  season?: string;
  episode?: string;
};

export const getUrlInfo = (url: string): UrlInfo => {
  const match = url.match(
    /^(?:https:\/\/asianc\.to)?\/drama\/stream\/([^/]+)\/?([^/]+)?\/?([^/]+)?$/
  );
  if (!match) throw new Error(`Invalid url: ${url}`);

  const [, id, season, episode] = match;

  return {
    id: id,
    season: season || undefined,
    episode: episode || undefined,
  };
};