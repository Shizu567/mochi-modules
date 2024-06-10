import * as cheerio from "cheerio";
import axios from 'axios';

export const getPlaylistImages = async (id: string, posterSize: 150 | 200 | 220 = 220) => {
  const url = `https://asianc.to/drama/stream/${id}`;
  const response = await axios.get(url);
  const $ = cheerio.load(response.data);

  const posterImage = $(".poster-image-class > img").attr("data-src"); // Update this selector

  const bannerImage = $(".banner-image-class")
    .attr("style")
    ?.match(/url\(([^)]+)\)/)?.[1];

  return {
    posterImage: posterImage
      ? convertPosterSize(`https://asianc.to${posterImage}`, posterSize)
      : undefined,
    bannerImage: bannerImage ? `https://asianc.to${bannerImage}` : undefined,
  };
};

export const convertPosterSize = (url: string, posterSize: 150 | 200 | 220) => {
  return url.replace(/\d+x\d+/, `${posterSize}x${posterSize * 1.5}`);
};