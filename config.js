import * as dotenv from "dotenv";
import { readFile } from "fs/promises";

dotenv.config();

const configFile = JSON.parse(
  await readFile(new URL("./config.json", import.meta.url))
);

const defaultConfig = {
    sites: [],
    base: {},
    locations: [],
    imageComparison: {},
};

class config {
  constructor(params) {
    const { sites, base, locations, imageComparison } = params;

    //site crawling config
    this.sites = sites || defaultConfig.sites;
    this.base = base || defaultConfig.base;
    this.locations = locations || defaultConfig.locations;

    // image comparison config
    this.imageComparison = imageComparison || defaultConfig.imageComparison;

    //bucket
    this.bucket = process.env.BUCKET;
    this.bucketRegion = process.env.BUCKET_REGION;

  }
}

export default new config(configFile || defaultConfig);
