import fs from 'fs';
import https from 'https';
import crypto from 'crypto'
import express, { Request, Response } from "express";
import { WebClient } from '@slack/web-api';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const mode = process.env.MODE;
const slackToken = process.env.SLACK_BOT_TOKEN;
const slackChannel = process.env.SLACK_CHANNEL;
const webhookSecret = process.env.PLANETSCALE_WEBHOOK_SECRET;
const credentialsPath = process.env.CREDENTIALS_PATH;


const slack = new WebClient(slackToken);

async function sendSlackMessage(message: string) {
  if (!slackChannel) {
    throw new Error('SLACK_CHANNEL_ID is not defined');
  }
  await slack.chat.postMessage({
    channel: slackChannel,
    text: message,
    mrkdwn: true
  });
}

const verifySignature = (req: Request, secret: string): boolean => {
  const signature = crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex');
  const trusted = Buffer.from(signature, 'ascii');
  const header = (req.headers['x-planetscale-signature'] as string);
  if (header === undefined) {
    return false;
  }
  const untrusted = Buffer.from(header)
  const isValid = crypto.timingSafeEqual(trusted, untrusted);
  return isValid;
}

app.get('/', (req: Request, res: Response) => {
  res.send('this server is for webhooks');
});

app.post('/webhook', async (req, res) => {

  console.log(req.body)
  
  //if (!verifySignature(req, webhookSecret)) {
  //  return res.status(401).send('Unauthorized');
  //}

  console.log('about to decide where to send this')

  try {
    const data = req.body;
    const event = data.event;

    switch (event) {
      case 'deploy_request.opened':
        await sendSlackMessage(`${data.resource.actor.display_name} opened <${data.resource.html_url}|${data.resource.branch}> against \`${data.database}/${data.resource.into_branch}\``);
      break;

      case 'deploy_request.queued':
        await sendSlackMessage(`${data.resource.actor.display_name} queued <${data.resource.html_url}|${data.resource.branch}>`);
      break;

      case 'deploy_request.in_progress':
        await sendSlackMessage(`${data.resource.actor.display_name} started <${data.resource.html_url}|${data.resource.branch}>`);
      break;

      case 'deploy_request.schema_applied':
        await sendSlackMessage(`${data.resource.actor.display_name} has deployed <${data.resource.html_url}|${data.resource.branch}> to \`${data.database}/${data.resource.into_branch}\``);
      break;

      case 'deploy_request.errored':
        await sendSlackMessage(`<${data.resource.html_url}|${data.resource.branch}> has errored`);
      break;

      case 'deploy_request.reverted':
        await sendSlackMessage(`${data.resource.actor.display_name} has reverted <${data.resource.html_url}|${data.resource.branch}>`);
      break;

      case 'deploy_request.closed':
        await sendSlackMessage(`${data.resource.actor.display_name} has closed <${data.resource.html_url}|${data.resource.branch}>`);
      break;

      case 'branch.anomaly':
        await sendSlackMessage(`:warning:  <https://app.planetscale.com/${data.organization}/${data.database}/${data.resource.parent_branch}/insights/anomalies | Anomaly detected> on \`${data.database}/${data.resource.parent_branch}\``);
      break;

      case 'branch.ready':
        await sendSlackMessage(`<https://app.planetscale.com/${data.organization}/${data.database}/${data.resource.name} | Branch \`${data.resource.name}\` is ready >`);
      break;

      case 'branch.sleeping':
        await sendSlackMessage(`<https://app.planetscale.com/${data.organization}/${data.database}/${data.resource.name} | Branch \`${data.resource.name}\` is sleeping >`);
      break;

      case 'webhook.test':
        await sendSlackMessage(`Webhook test recieved from: \`${data.organization}/${data.database}\``);
      break;

      default:
        console.log(`Received an unknown event type: ${event}`);
        await sendSlackMessage(`Received an unknown event type: \`${event}\``);
      break;
    }

    res.status(200).send('Webhook processed successfully');
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Error processing webhook');
  }
});

if (mode == 'standalone') {
  const privateKey = fs.readFileSync(`${credentialsPath}/privkey.pem`, 'utf8');
  const certificate = fs.readFileSync(`${credentialsPath}/cert.pem`, 'utf8');
  const ca = fs.readFileSync(`${credentialsPath}/chain.pem`, 'utf8');
  const credentials = { key: privateKey, cert: certificate, ca: ca };
  const httpsServer = https.createServer(credentials, app);
  httpsServer.listen(443, () => console.log('server started') );
}

export default app;
