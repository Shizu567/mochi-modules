export function scrapeAvailableLanguages($: cheerio.Root) {
  return $(".language-options > img")
    .toArray()
    .map((img) => {
      const langId = $(img)
        .attr("src")!
        .match(/\/([^./]+).png/)![1];

      const langKey = $(img).attr("data-lang")!;

      return { id: langId, langKey };
    });
}