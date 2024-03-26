import {
  DiscoverListing,
  DiscoverListingOrientationType,
  DiscoverListingType,
  Paging,
  Playlist,
  PlaylistDetails,
  PlaylistEpisodeServerRequest,
  PlaylistEpisodeServerResponse,
  PlaylistEpisodeSource,
  PlaylistEpisodeSourcesRequest,
  PlaylistItemsOptions,
  PlaylistItemsResponse,
  PlaylistStatus,
  PlaylistType,
  SearchFilter,
  SearchQuery,
  SourceModule,
  VideoContent,
} from "@mochiapp/js";
import { getUrlInfo, getPlaylistImages, convertPosterSize } from "./utils";
import * as cheerio from "cheerio";
import { scrapeAvailableLanguages, scrapeGenres, scrapeGroups, scrapeSynopsis } from "./scraper";
import { ExtractorId, extract, extractors } from "$shared/extractors";
import { getM3u8Qualities } from "$shared/utils";

// very ugly hack to change BASE_URL
// this is needed bc mochi js implementation cannot read class properties
// pls fix erik :-(
let BASE_URL = "https://aniworld.to";

export default class AniWorld extends SourceModule implements VideoContent {
  static LANGUAGES = new Map(
    Object.entries({
      german: "GerDub",
      "japanese-german": "GerSub",
      "japanese-english": "EngSub",
    })
  );

  metadata = {
    id: "aniworld",
    name: "AniWorld",
    description: "Module to watch anime from AniWorld",
    icon: `${BASE_URL}/favicon.ico`,
    version: "1.1.1",
  };

  constructor(baseUrl?: string) {
    super();
    BASE_URL = baseUrl || "https://aniworld.to";
  }

  async searchFilters(): Promise<SearchFilter[]> {
    return [];
  }

  async search(query: SearchQuery): Promise<Paging<Playlist>> {
    const response = await request.post(`${BASE_URL}/ajax/search`, {
      body: `keyword=${query.query}`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    const data = response.json() as { title: string; description: string; link: string }[];

    const ids: string[] = [];

    const playlists: Promise<Playlist>[] = data
      .filter(({ link }) => link.startsWith("/anime/stream/")) // animes only
      .filter(({ link }) => link.split("/").length === 4) // no specific season or episode results
      .filter(({ link }) => {
        const id = link.split("/")[3];
        if (ids.includes(id)) return false;
        ids.push(id);
        return true;
      }) // remove duplicate results
      .map(async (item) => {
        const { id } = getUrlInfo(item.link);
        const { posterImage, bannerImage } = await getPlaylistImages(id);

        return {
          id,
          title: cheerio.load(item.title)(":root").text(),
          url: `${BASE_URL}${item.link}`,
          posterImage,
          bannerImage,
          status: PlaylistStatus.unknown,
          type: PlaylistType.video,
        } satisfies Playlist;
      });

    return {
      id: "",
      items: await Promise.all(playlists), // thx @ElNixu for parallel loading of images
    };
  }

  async discoverListings(): Promise<DiscoverListing[]> {
    console.log(BASE_URL);

    const response = await request.get(`${BASE_URL}`);
    const $ = cheerio.load(response.text());

    const carousels = $(".carousel:not(.animeNews)")
      .toArray()
      .map((carousel) => {
        return {
          id: $(carousel).find("h2").text().toLowerCase().replace(" ", "-"),
          title: $(carousel).find("h2").text(),
          type: DiscoverListingType.default,
          orientation: DiscoverListingOrientationType.portrait,
          paging: {
            id: "0",
            items: $(carousel)
              .find(".coverListItem > a")
              .toArray()
              .map((a) => {
                return {
                  id: $(a).attr("href")!.split("/").at(-1)!,
                  title: $(a).find("h3").text(),
                  posterImage: convertPosterSize(
                    `${BASE_URL}${$(a).find("img").attr("data-src")!}`,
                    220
                  ),
                  bannerImage: undefined,
                  url: `${BASE_URL}${$(a).attr("href")}`,
                  status: PlaylistStatus.unknown,
                  type: PlaylistType.video,
                } satisfies Playlist;
              }),
          },
        } satisfies DiscoverListing;
      });

    return [...carousels];
  }

  async playlistDetails(id: string): Promise<PlaylistDetails> {
    const response = await request.get(`${BASE_URL}/anime/stream/${id}`);
    const $ = cheerio.load(response.text());

    let yearReleased;
    try {
      yearReleased = parseInt($("span[itemprop='startDate'] > a").text());
    } catch {
      yearReleased = undefined;
    }

    return {
      synopsis: scrapeSynopsis($),
      altTitles: [],
      altPosters: [],
      altBanners: [],
      genres: scrapeGenres($),
      yearReleased,
      ratings: undefined,
      previews: [],
    };
  }

  async playlistEpisodes(
    playlistId: string,
    options?: PlaylistItemsOptions | undefined
  ): Promise<PlaylistItemsResponse> {
    const groupId = options?.groupId || "";

    const response = await request.get(`${BASE_URL}/anime/stream/${playlistId}/${groupId}`);
    const $ = cheerio.load(response.text());

    return scrapeGroups($);
  }

  async playlistEpisodeSources(
    req: PlaylistEpisodeSourcesRequest
  ): Promise<PlaylistEpisodeSource[]> {
    const { playlistId, episodeId: _episodeId } = req;
    const [groupId, episodeId, variantId] = _episodeId.split("/");

    const response = await request.get(
      `${BASE_URL}/anime/stream/${playlistId}/${groupId}/${episodeId}`
    );
    const $ = cheerio.load(response.text());

    const availableLanguages = scrapeAvailableLanguages($);
    const langKey =
      availableLanguages.find(({ id }) => id === variantId)?.langKey ||
      availableLanguages[0].langKey;

    const servers = $(".hosterSiteVideo > ul.row > li")
      .toArray()
      .filter((li) => $(li).attr("data-lang-key") == langKey) // filter by language
      .map((li) => {
        const id = $(li).attr("data-link-target")!.split("/").at(-1)!;
        const displayName = $(li).find("h4").text();
        return { id: `${displayName.toLowerCase()}/${id}`, displayName };
      })
      .filter(({ displayName }) => Object.keys(extractors).includes(displayName.toLowerCase())); // filter for supported servers

    return [
      {
        id: "aniworld",
        displayName: "AniWorld",
        description: undefined,
        servers,
      },
    ];
  }

  async playlistEpisodeServer(
    req: PlaylistEpisodeServerRequest
  ): Promise<PlaylistEpisodeServerResponse> {
    const { serverId: _serverId } = req;
    const [serverId, redirectId] = _serverId.split("/");

    if (!Object.keys(extractors).includes(serverId)) throw new Error("Invalid server");

    const { url } = await extract(`${BASE_URL}/redirect/${redirectId}`, serverId as ExtractorId);

    const links = await getM3u8Qualities(url);

    return {
      links,
      subtitles: [],
      skipTimes: [],
      headers: {},
    };
  }
}
