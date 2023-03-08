const puppeteer = require("puppeteer");

const PUPPETEER_OPTIONS = {
  headless: true,
  args: [
    // '--disable-gpu',
    // '--disable-dev-shm-usage',
    // '--disable-setuid-sandbox',
    // '--timeout=30000',
    // '--no-first-run',
    // '--no-sandbox',
    // '--no-zygote',
    // '--single-process',
    // "--proxy-server='direct://'",
    // '--proxy-bypass-list=*',
    // '--deterministic-fetch',
  ],
};

const openConnection = async () => {
  const browser = await puppeteer.launch(PUPPETEER_OPTIONS);
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  return { browser, page };
};

const closeConnection = async (page, browser) => {
  page && (await page.close());
  browser && (await browser.close());
};

exports.screenGrabber = async (req, res) => {
  let { browser, page } = await openConnection();

  // Early return if URL is not provided
  if (!req.query.url) {
    return res.status(400).send("URL is required");
  }

  const url = req.query.url.replace(/\\/g, "");

  try {
    await page.goto(url);

    // Check if featured block exists
    const element = await page.$(".homepage__main-feature-block");
    if (!element) {
      return res.status(404).send("Element not found");
    }

    // Take screenshot
    const screenshot = await element.screenshot();

    // Send screenshot to Client
    res.contentType("image/png");
    res.status(200).send(screenshot);
  } catch (err) {
    res.status(500).send(err.message);
  } finally {
    await closeConnection(page, browser);
  }
};
