import SlackNotify from "slack-notify";
import * as dotenv from "dotenv";
dotenv.config();

const { SLACK_URL } = process.env;
const MY_SLACK_WEBHOOK_URL = SLACK_URL;

const slack = SlackNotify(MY_SLACK_WEBHOOK_URL);

class slackService {
  constructor() {}

  sendAlert(message) {
    slack.alert(message);
  }

  createAlert(params) {
    const { site, location, file, pixelDifference, percentageDifference } =
      params;
    const title = `Potential Stale Cache`;
    const caption = `A visual regression was detected on ${site.name} from ${location.name}`;
    const captionFooter = `This is an automated message`;

    return {
      pretext: captionFooter,
      color: "#FFA500",
      attachments: [
        {
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: title,
              },
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: caption,
                },
              ],
            },
            {
              type: "divider",
            },
            {
              type: "image",
              image_url: file,
              alt_text: "regression_info",
            },
            {
              type: "divider",
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*Pixels Changed:*\n ${pixelDifference}`,
                },
                {
                  type: "mrkdwn",
                  text: `*% Difference:*\n ${percentageDifference}`,
                },
              ],
            },
          ],
        },
      ],
    };
  }

  createSummary(params) {
    const { failed, passed, time } = params
    const seconds = Math.round(time / 1000)
    const caption = `Regression Summary complete in ${seconds} seconds`;
    return {
      color: "#7300ff",
      attachments: [
        {
          blocks: [
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: caption,
                },
              ],
            },
            {
              type: "divider",
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*Screenshots taken*:\n ${passed.length}`,
                },
                {
                  type: "mrkdwn",
                  text: `*Screenshots failed:*\n ${failed.length}`,
                },
              ],
            },
          ],
        },
      ],
    };
    
  }
}

export default new slackService
