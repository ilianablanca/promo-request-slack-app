require('dotenv').config();
const { App } = require('@slack/bolt');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// Slash command: /promo-request
app.command('/promo-request', async ({ ack, body, client }) => {
  await ack();

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'promo_request_modal',
      title: { type: 'plain_text', text: 'Solicitud de promo' },
      submit: { type: 'plain_text', text: 'Enviar' },
      close: { type: 'plain_text', text: 'Cancelar' },
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '👋 Este es un modal de prueba. En el siguiente paso agregamos las 25 preguntas.',
          },
        },
      ],
    },
  });
});

// Manejo del submit (placeholder, lo completamos en el siguiente paso)
app.view('promo_request_modal', async ({ ack, body, client }) => {
  await ack();
  console.log('Formulario recibido (placeholder):', JSON.stringify(body.view.state.values));
});

(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`⚡ Promo Slack App corriendo en puerto ${port}`);
})();
