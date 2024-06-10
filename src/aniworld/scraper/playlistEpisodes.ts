import { PlaylistGroup, PlaylistGroupVariant, PlaylistItem } from "@mochiapp/js";

// Function to scrape episode groups from Dramacool
export function scrapeGroups($: cheerio.Root): PlaylistGroup[] {
  let selectedGroupId: string;

  const groups: PlaylistGroup[] = $(".episode-list > li > a")
    .toArray()
    .map((a, idx) => {
      const id = $(a)
        .attr("href")!
        .split("/")
        .pop()!;

      const title = $(a).attr("title") || $(a).text();

      if ($(a).hasClass("active")) selectedGroupId = id;

      return {
        id,
        number: idx,
        altTitle: title,
        variants: id === selectedGroupId ? scrapeVariants($) : undefined,
      } satisfies PlaylistGroup;
    });

  return groups;
}

// Function to scrape episode variants (like subtitles or dubs)
export function scrapeVariants($: cheerio.Root): PlaylistGroupVariant[] {
  return $(".variant-options > img")
    .toArray()
    .map((img) => {
      const id = $(img)
        .attr("src")!
        .match(/\/([^./]+).png/)![1];

      const name = id;  // Or map to more readable names

      return {
        id,
        title: name,
        pagings: [
          {
            id: "all-episodes",
            title: "All Episodes",
            items: scrapeEpisodes($, id),
          },
        ],
      } satisfies PlaylistGroupVariant;
    });
}

// Function to scrape episodes
export function scrapeEpisodes($: cheerio.Root, variantId: string): PlaylistItem[] {
  return $(".episode-list > li")
    .toArray()
    .map((li, idx) => {
      const id = $(li)
        .find("a")
        .attr("href")!
        .split("/")
        .pop()!;

      const title = $(li).find(".episode-title").text().trim();

      return {
        id: `${id}/${variantId}`,
        title,
        description: $(li).find(".episode-description").text(),
        thumbnail: $(li).find("img").attr("src"),
        number: idx,
        timestamp: new Date().getTime(),  // Or scrape the actual timestamp if available
        tags: [],
      } satisfies PlaylistItem;
    });
}