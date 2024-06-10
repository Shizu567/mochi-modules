import { sanitizeHtml } from "../utils";
import cheerio from "cheerio";

// Function to scrape the synopsis from Dramacool
export function scrapeSynopsis($: cheerio.Root) {
  const description = sanitizeHtml($(".description").text() ?? "");

  const cast = $(".cast-list > li")
    .toArray()
    .map((li) => {
      const actorName = $(li).find(".actor-name").text();
      const characterName = $(li).find(".character-name").text();

      return `${actorName} as ${characterName}`;
    })
    .join(", ");

  return `${description}\n\nCast: ${cast}`;
}

// Function to scrape the genres from Dramacool
export function scrapeGenres($: cheerio.Root) {
  return $(".genre-list a")
    .toArray()
    .map((genre) => $(genre).text());
}