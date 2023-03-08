import fetch, { AbortError } from "node-fetch";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as fastPng from "fast-png";
import { diff } from "pixel-buffer-diff";
import { Storage } from "@google-cloud/storage";
import sharp from "sharp";

import config from "./config.js";
import slackService from "./slack.js";

// AbortController was added in node v14.17.0 globally
const AbortController =
  globalThis.AbortController || (await import("abort-controller"));
const controller = new AbortController();

const timeout = setTimeout(() => {
  controller.abort();
}, 120000);

let running = false;

dotenv.config();

class cacheTester {
  constructor() {
    this.failed = [];
    this.passed = [];
    this.startTime = 0;
    this.endTime = 0;
  }

  async upload(file) {
    const bucketName = "cache-visual-regression";

    const storage = new Storage({
      projectId: "peaceful-parity-308605",
      keyFilename: "./auth.json",
    });

    const bucket = storage.bucket(bucketName);

    const res = await bucket.file(file.name).save(file.buffer, function (err) {
      if (err) return console.log(err);
      return `https://storage.googleapis.com/${bucketName}/${file.name}`;
    });

    return res;
  }

  makeDir(path, file) {
    if (!fs.existsSync(path)) {
      fs.mkdirSync(path);
    }
  }

  async getBuffer(url) {
    try {
      const response = await fetch(url, { signal: controller.signal });
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const baseBuffer = Buffer.from(arrayBuffer);
      return baseBuffer;
    } catch (error) {
      if (error instanceof AbortError) {
        console.log("request was aborted");
        console.log(error)
      } else {
        console.log(error);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  getSlug(string) {
    return string
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  delay(time) {
    return new Promise(function (resolve) {
      setTimeout(resolve, time);
    });
  }

  getPixelDifference(result, referenceImage) {
    const percentageChanged = (result.diff / referenceImage.data.length) * 100;
    const percentageChangedRounded = Math.round(percentageChanged * 100) / 100;
    return {
      percentageChanged,
      percentageChangedRounded,
      pixels: result.diff,
    };
  }

  async getScreenshot(edge, url) {
    const screenshotBuffer = await this.getBuffer(`${edge}?url=${url}`);
    if (!screenshotBuffer) {
      return {
        success: false,
      };
    } else {
      return {
        success: true,
        screenshotBuffer,
      };
    }
  }

  async compareImages(referenceImage, edgeImage) {
    const { width: referenceWidth, height: referenceHeight } = referenceImage;
    const { width: edgeWidth, height: edgeHeight } = edgeImage;

    const width = Math.min(referenceWidth, edgeWidth);
    const height = Math.min(referenceHeight, edgeHeight);

    return {
      width,
      height,
    };
  }

  async cropImage(imageBuffer, width, height) {
    const croppedImage = await sharp(imageBuffer)
      .png()
      .extract({ left: 0, top: 0, width: width, height: height })
      .toBuffer({ resolveWithObject: true });

    return croppedImage;
  }

  async init() {
    // this.makeDir("screenshots");
    const { sites, base, locations } = config;

    this.startTime = performance.now();

    // Take screenshots of each site
    for await (const site of sites) {
      const screenshot = await this.getScreenshot(base.edge, site.url);

      if (!screenshot.success) {
        console.log(`Error taking screenshot of ${site.name}`);
        continue;
      }

      console.log(`Took a base screenshot of ${site.name}`);
      const referenceImageBuffer = screenshot.screenshotBuffer;

      let referenceImage = await fastPng.decode(referenceImageBuffer);

      for await (const location of locations) {
        // Get the edge Image from each location
        //let edgeImageBuffer = await this.getScreenshot(location.edge, site.url);

        const perf = {}

        perf.fetchStart = performance.now();

        let edgeScreenshot = await this.getScreenshot(location.edge, site.url);
        if (!edgeScreenshot.success) {
          this.failed.push(
            `Screenshot failed for ${site.name} from ${location.name} 📸`
          );
          continue;
        }

        this.passed.push(
          `Screenshot taken for ${site.name} from ${location.name} 📸`
        );

        perf.fetchEnd = performance.now();
        perf.processStart = performance.now();

        let edgeImageBuffer = edgeScreenshot.screenshotBuffer;

        let edgeImage = await fastPng.decode(edgeImageBuffer);
        
        // Return the smaller dimensions of the two images
        const { width, height } = await this.compareImages(
          referenceImage,
          edgeImage
        );

        // Crop images to smallest dimensions
        const { data: croppedReferenceImage } = await this.cropImage(
          referenceImageBuffer,
          width,
          height
        );
        const { data: croppedEdgeImage } = await this.cropImage(
          edgeImageBuffer,
          width,
          height
        );

        // Decode the cropped images
        referenceImage = await fastPng.decode(croppedReferenceImage);
        edgeImage = await fastPng.decode(croppedEdgeImage);

        // Create canvas for diff image
        const diffImageData = {
          width: 3 * width,
          height: height,
          data: new Uint8ClampedArray(3 * width * height * 4),
        };

        // Compare the images
        const result = diff(
          referenceImage.data,
          edgeImage.data,
          diffImageData.data,
          width,
          height,
          {
            includeAA: false,
            threshold: 0.2,
            cumulatedThreshold: 0.5,
            enableMinimap: true,
          }
        );

        // Get the percentage of pixels that are different
        const pixelDifference = this.getPixelDifference(result, referenceImage);

        // The percentage of pixels that are allowed to be different
        if (pixelDifference.percentageChangedRounded > 10) {
          const fileName = this.getSlug(
            `${site.name}/${location.name}-${
               new Date().toISOString().replace(/:/g, "-")
            }`
          );

          const file = await this.upload({
            name: fileName + ".png",
            buffer: fastPng.encode(diffImageData),
          });

          await slackService.sendAlert(
            slackService.createAlert({
              site,
              location,
              file,
              pixelDifference: pixelDifference.pixels,
              percentageDifference: pixelDifference.percentageChangedRounded,
            })
          );
        } else {
          console.log(
            "No Difference for " + site.name + " at " + location.name + ""
          );
        }

        perf.processEnd = performance.now();

        console.log('Performance Timings', {
          fetchTime: perf.fetchEnd - perf.fetchStart / 1000,
          processTime: perf.processEnd - perf.processStart / 1000,
        })
      }
    }

    this.endTime = performance.now();

    // await slackService.sendAlert(
    //   slackService.createSummary({
    //     passed: this.passed,
    //     failed: this.failed,
    //     time: this.endTime - this.startTime,
    //   })
    // );

    running = false;
  }
}

export function run(req, res) {

  if (running) {
    return res.status(400).send({
      status: "error",
      message: "Tests are already running",
    });
  }

  if (!req.query.token) {
    return res.status(400).send({
      status: "error",
      message: "Token is required",
    });
  }

  if (req.query.token !== process.env.TOKEN) {
    return res.status(400).send({
      status: "error",
      message: "Invalid token",
    });
  }

  res.send({
    status: "success",
    message: "Running tests, alerts will be sent to the configured Slack channel",
  })

  running = true;

  new cacheTester().init();
}