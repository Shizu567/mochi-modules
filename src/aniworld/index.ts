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
import { getUrlInfo, getPlaylistImages, convertPosterSize, sanitizeHtml } from "./utils";
import * as cheerio from "cheerio";
import { scrapeAvailableLanguages, scrapeGenres, scrapeGroups, scrapeSynopsis } from "./scraper";
import { ExtractorId, extract, extractors } from "$shared/extractors";
import { getM3u8Qualities } from "$shared/utils";
import axios from 'axios';

let BASE_URL = "https://asianc.to";

export default class Dramacool extends SourceModule implements VideoContent {
  static LANGUAGES = new Map(
    Object.entries({
      korean: "KorSub",
      "chinese-english": "EngSub",
      "japanese-english": "EngSub",
    })
  );

  metadata = {
    id: "dramacool",
    name: "Dramacool",
    description: "Module to watch dramas from Dramacool",
    icon: `${BASE_URL}/favicon.ico`,
    version: "1.0.0",
  };

  constructor(baseUrl?: string) {
    super();
    BASE_URL = baseUrl || "https://asianc.to";
  }

  async search(query: SearchQuery): Promise<Paging<Playlist>> {
    const response = await axios.post(`${BASE_URL}/ajax/search`, {
      params: { keyword: query.query },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });
    const data = response.data as { title: string; description: string; link: string }[];

    const ids: string[] = [];

    const playlists: Promise<Playlist>[] = data
      .filter(({ link }) => link.startsWith("/drama/stream/"))
      .filter(({ link }) => link.split("/").length === 4)
      .filter(({ link }) => {
        const id = link.split("/")[3];
        if (ids.includes(id)) return false;
        ids.push(id);
        return true;
      })
      .map(async (item) => {
        const { id } = getUrlInfo(item.link);
        const { posterImage, bannerImage } = await getPlaylistImages(id);

        return {
          id,
          title: sanitizeHtml(item.title),
          url: `${BASE_URL}${item.link}`,
          posterImage,
          bannerImage,
          status: PlaylistStatus.unknown,
          type: PlaylistType.video,
        } satisfies Playlist;
      });

    return {
      id: "",
      items: await Promise.all(playlists),
    };
  }

  async discoverListings(): Promise<DiscoverListing[]> {
    const response = await axios.get(`${BASE_URL}`);
    const $ = cheerio.load(response.data);

    const carousels = $(".carousel:not(.dramaNews)")
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
    const response = await axios.get(`${BASE_URL}/drama/stream/${id}`);
    const $ = cheerio.load(response.data);

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

    const response = await axios.get(`${BASE_URL}/drama/stream/${playlistId}/${groupId}`);
    const $ = cheerio.load(response.data);

    return scrapeGroups($);
  }

  async playlistEpisodeSources(
    req: PlaylistEpisodeSourcesRequest
  ): Promise<PlaylistEpisodeSource[]> {
    const { playlistId, episodeId: _episodeId } = req;
    const [groupId, episodeId, variantId] = _episodeId.split("/");

    const response = await axios.get(
      `${BASE_URL}/drama/stream/${playlistId}/${groupId}/${episodeId}`
    );
    const $ = cheerio.load(response.data);

    const availableLanguages = scrapeAvailableLanguages($);
    const langKey =
      availableLanguages.find(({ id }) => id === variantId)?.langKey ||
      availableLanguages[0].langKey;

    const servers = $(".hosterSiteVideo > ul.row > li")
      .toArray()
      .filter((li) => $(li).attr("data-lang-key") == langKey)
      .map((li) => {
        const id = $(li).attr("data-link-target")!.split("/").at(-1)!;
        const displayName = $(li).find("h4").text();
        return { id: `${displayName.toLowerCase()}/${id}`, displayName };
      })
      .filter(({ displayName }) => Object.keys(extractors).includes(displayName.toLowerCase()));

    return [
      {
        id: "dramacool",
        displayName: "Dramacool",
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