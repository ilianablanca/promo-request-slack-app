require('dotenv').config();
const { App } = require('@slack/bolt');
const fetch = require('node-fetch');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// ── Constantes ──────────────────────────────────────────────
const APPROVER_NEW_USERS = 'U0AKGADMDCH'; // tú
const APPROVER_OTHER = 'U09QUKD5AUR';     // María Cervantes

const TIPOS_CON_PUNTOS = ['cashback', 'reto', 'award'];

// ── Helpers de estado ───────────────────────────────────────
function extractStateValues(values) {
  const result = {};
  for (const blockId in values) {
    for (const actionId in values[blockId]) {
      const el = values[blockId][actionId];
      if (el.type === 'plain_text_input') result[actionId] = el.value || '';
      else if (el.type === 'static_select') result[actionId] = el.selected_option ? el.selected_option.value : null;
      else if (el.type === 'users_select') result[actionId] = el.selected_user || null;
      else if (el.type === 'multi_users_select') result[actionId] = el.selected_users || [];
      else if (el.type === 'datepicker') result[actionId] = el.selected_date || null;
    }
  }
  return result;
}

function opt(text, value) {
  return { text: { type: 'plain_text', text }, value };
}

// ── Constructores de bloques por pantalla ───────────────────
function blocksPage1(a) {
  return [
    { type: 'input', block_id: 'b_requester', label: { type: 'plain_text', text: 'Requester' },
      element: { type: 'users_select', action_id: 'requester', ...(a.requester ? { initial_user: a.requester } : {}) } },
    { type: 'input', block_id: 'b_equipo', label: { type: 'plain_text', text: 'Equipo del requester' },
      element: { type: 'static_select', action_id: 'equipo',
        options: ['Business Development', 'Growth', 'KAMs', 'Risk', 'Merch Ops', 'Marketing', 'Affiliates'].map(t => opt(t, t)),
        ...(a.equipo ? { initial_option: opt(a.equipo, a.equipo) } : {}) } },
    { type: 'input', block_id: 'b_tipo', label: { type: 'plain_text', text: 'Tipo de promoción' },
      element: { type: 'static_select', action_id: 'tipo',
        options: [
          opt('Promocode', 'promocode'), opt('Campaña de cashback', 'cashback'), opt('Reto', 'reto'),
          opt('Award', 'award'), opt('0% fee', 'fee0'), opt('Automática', 'automatica'), opt('Otro', 'otro'),
        ],
        ...(a.tipo ? { initial_option: opt(a.tipo, a.tipo) } : {}) } },
  ];
}

function blocksPage2(a) {
  return [
    { type: 'input', block_id: 'b_tipo_descuento', label: { type: 'plain_text', text: 'Tipo de descuento' },
      element: { type: 'static_select', action_id: 'tipo_descuento',
        options: ['%', '$', 'Puntos', '0% comisión', 'Otro'].map(t => opt(t, t)),
        ...(a.tipo_descuento ? { initial_option: opt(a.tipo_descuento, a.tipo_descuento) } : {}) } },
    { type: 'input', block_id: 'b_valor_descuento', label: { type: 'plain_text', text: 'Valor del descuento' },
      element: { type: 'plain_text_input', action_id: 'valor_descuento', ...(a.valor_descuento ? { initial_value: a.valor_descuento } : {}) } },
    { type: 'input', block_id: 'b_codigo', label: { type: 'plain_text', text: 'Código del cupón o campaña' },
      element: { type: 'plain_text_input', action_id: 'codigo', placeholder: { type: 'plain_text', text: 'NA si no aplica' }, ...(a.codigo ? { initial_value: a.codigo } : {}) } },
    { type: 'input', block_id: 'b_minimo_compra', label: { type: 'plain_text', text: 'Mínimo de compra' },
      element: { type: 'plain_text_input', action_id: 'minimo_compra', ...(a.minimo_compra ? { initial_value: a.minimo_compra } : {}) } },
    { type: 'input', block_id: 'b_maximo_descuento', label: { type: 'plain_text', text: 'Máximo de descuento' },
      element: { type: 'plain_text_input', action_id: 'maximo_descuento', ...(a.maximo_descuento ? { initial_value: a.maximo_descuento } : {}) } },
    { type: 'input', block_id: 'b_merchant_name_compra', label: { type: 'plain_text', text: 'Merchant name(s) [compra]' },
      element: { type: 'plain_text_input', action_id: 'merchant_name_compra', multiline: true, ...(a.merchant_name_compra ? { initial_value: a.merchant_name_compra } : {}) } },
    { type: 'input', block_id: 'b_merchant_id_compra', label: { type: 'plain_text', text: 'Merchant id(s) [compra]' },
      element: { type: 'plain_text_input', action_id: 'merchant_id_compra', multiline: true, ...(a.merchant_id_compra ? { initial_value: a.merchant_id_compra } : {}) } },
    { type: 'input', block_id: 'b_merchant_channel', label: { type: 'plain_text', text: 'Merchant channel' },
      element: { type: 'static_select', action_id: 'merchant_channel',
        options: ['Online', 'Offline', 'Ambos'].map(t => opt(t, t)),
        ...(a.merchant_channel ? { initial_option: opt(a.merchant_channel, a.merchant_channel) } : {}) } },
  ];
}

function blocksPage3(a) {
  return [
    { type: 'input', block_id: 'b_fecha_inicio', label: { type: 'plain_text', text: 'Fecha inicio' },
      element: { type: 'datepicker', action_id: 'fecha_inicio', ...(a.fecha_inicio ? { initial_date: a.fecha_inicio } : {}) } },
    { type: 'input', block_id: 'b_fecha_fin', label: { type: 'plain_text', text: 'Fecha fin' },
      element: { type: 'datepicker', action_id: 'fecha_fin', ...(a.fecha_fin ? { initial_date: a.fecha_fin } : {}) } },
    { type: 'input', block_id: 'b_horas_dia', label: { type: 'plain_text', text: 'Horas del día' },
      element: { type: 'plain_text_input', action_id: 'horas_dia', placeholder: { type: 'plain_text', text: 'Ej. Todo el día, o 09:00-22:00' }, ...(a.horas_dia ? { initial_value: a.horas_dia } : {}) } },
    { type: 'input', block_id: 'b_usos_totales', label: { type: 'plain_text', text: 'Usos totales' },
      element: { type: 'plain_text_input', action_id: 'usos_totales', ...(a.usos_totales ? { initial_value: a.usos_totales } : {}) } },
    { type: 'input', block_id: 'b_usos_por_usuario', label: { type: 'plain_text', text: 'Usos por usuario' },
      element: { type: 'plain_text_input', action_id: 'usos_por_usuario', ...(a.usos_por_usuario ? { initial_value: a.usos_por_usuario } : {}) } },
  ];
}

function blocksPagePuntos(a) {
  const hint = { type: 'plain_text', text: "Solo llenar si aplica. Si no, escribe NA." };
  return [
    { type: 'section', text: { type: 'mrkdwn', text: '_Esta promoción involucra puntos — completa lo siguiente:_' } },
    { type: 'input', block_id: 'b_merchant_name_gasto', label: { type: 'plain_text', text: 'Merchant name(s) gasto de puntos' },
      element: { type: 'plain_text_input', action_id: 'merchant_name_gasto', multiline: true, placeholder: hint, ...(a.merchant_name_gasto ? { initial_value: a.merchant_name_gasto } : {}) } },
    { type: 'input', block_id: 'b_merchant_id_gasto', label: { type: 'plain_text', text: 'Merchant id(s) gasto de puntos' },
      element: { type: 'plain_text_input', action_id: 'merchant_id_gasto', multiline: true, placeholder: hint, ...(a.merchant_id_gasto ? { initial_value: a.merchant_id_gasto } : {}) } },
    { type: 'input', block_id: 'b_minimo_compra_gasto', label: { type: 'plain_text', text: 'Mínimo de compra (gasto)' },
      element: { type: 'plain_text_input', action_id: 'minimo_compra_gasto', placeholder: hint, ...(a.minimo_compra_gasto ? { initial_value: a.minimo_compra_gasto } : {}) } },
    { type: 'input', block_id: 'b_vigencia_puntos', label: { type: 'plain_text', text: 'Vigencia de los puntos' },
      element: { type: 'plain_text_input', action_id: 'vigencia_puntos', placeholder: hint, ...(a.vigencia_puntos ? { initial_value: a.vigencia_puntos } : {}) } },
  ];
}

function blocksPage5(a) {
  const blocks = [
    { type: 'input', block_id: 'b_business_line', label: { type: 'plain_text', text: 'Business line' },
      element: { type: 'static_select', action_id: 'business_line',
        options: ['BNPL', 'VC', 'PC', 'Walmart', 'Ali', 'Todos', 'Combo'].map(t => opt(t, t)),
        ...(a.business_line ? { initial_option: opt(a.business_line, a.business_line) } : {}) } },
    { type: 'input', block_id: 'b_audiencia', label: { type: 'plain_text', text: 'Audiencia' },
      dispatch_action: true,
      element: { type: 'static_select', action_id: 'audiencia_select',
        options: ['Nuevos', 'Recurrentes', 'Lista específica'].map(t => opt(t, t)),
        ...(a.audiencia ? { initial_option: opt(a.audiencia, a.audiencia) } : {}) } },
  ];
  if (a.audiencia === 'Lista específica') {
    blocks.push({ type: 'input', block_id: 'b_especificacion_audiencia', label: { type: 'plain_text', text: 'Especificación de la audiencia' },
      element: { type: 'plain_text_input', action_id: 'especificacion_audiencia', multiline: true,
        placeholder: { type: 'plain_text', text: 'Link de la lista, o condiciones que deben cumplir los usuarios' },
        ...(a.especificacion_audiencia ? { initial_value: a.especificacion_audiencia } : {}) } });
  }
  blocks.push({ type: 'input', block_id: 'b_pay_now', label: { type: 'plain_text', text: '¿Incluye Pay Now?' },
    element: { type: 'static_select', action_id: 'pay_now',
      options: ['Sí', 'No'].map(t => opt(t, t)),
      ...(a.pay_now ? { initial_option: opt(a.pay_now, a.pay_now) } : {}) } });
  return blocks;
}

function blocksPage6(a) {
  const blocks = [
    { type: 'input', block_id: 'b_comentarios', label: { type: 'plain_text', text: 'Comentarios adicionales' },
      element: { type: 'plain_text_input', action_id: 'comentarios', multiline: true,
        placeholder: { type: 'plain_text', text: 'Ej. cupón válido para merchant X en fecha Y, y merchant Z en fecha W' },
        optional: true, ...(a.comentarios ? { initial_value: a.comentarios } : {}) } },
    { type: 'input', block_id: 'b_aprobado', label: { type: 'plain_text', text: '¿El descuento ya fue aprobado?' },
      dispatch_action: true,
      element: { type: 'static_select', action_id: 'aprobado_select',
        options: ['Sí', 'No'].map(t => opt(t, t)),
        ...(a.aprobado ? { initial_option: opt(a.aprobado, a.aprobado) } : {}) } },
  ];
  if (a.aprobado === 'Sí') {
    blocks.push({ type: 'input', block_id: 'b_aprobado_por', label: { type: 'plain_text', text: '¿Quién aprobó?' },
      element: { type: 'users_select', action_id: 'aprobado_por', ...(a.aprobado_por ? { initial_user: a.aprobado_por } : {}) } });
  } else if (a.aprobado === 'No') {
    blocks.push({ type: 'input', block_id: 'b_audiencia_no_aprobado', label: { type: 'plain_text', text: '¿Para quién es la promo?' },
      element: { type: 'static_select', action_id: 'audiencia_no_aprobado',
        options: ['Nuevos', 'Recurrentes', 'Todos'].map(t => opt(t, t)),
        ...(a.audiencia_no_aprobado ? { initial_option: opt(a.audiencia_no_aprobado, a.audiencia_no_aprobado) } : {}) } });
  }
  return blocks;
}

// ── Máquina de estados (orden de pantallas) ─────────────────
function needsPuntos(a) {
  return TIPOS_CON_PUNTOS.includes(a.tipo);
}

function nextStep(step, a) {
  if (step === 'p1') return 'p2';
  if (step === 'p2') return 'p3';
  if (step === 'p3') return needsPuntos(a) ? 'p_puntos' : 'p5';
  if (step === 'p_puntos') return 'p5';
  if (step === 'p5') return 'p6';
  return 'p6';
}

function prevStep(step, a) {
  if (step === 'p2') return 'p1';
  if (step === 'p3') return 'p2';
  if (step === 'p_puntos') return 'p3';
  if (step === 'p5') return needsPuntos(a) ? 'p_puntos' : 'p3';
  if (step === 'p6') return 'p5';
  return 'p1';
}

function buildView(step, a) {
  const isFinal = step === 'p6';
  let blocks;
  if (step === 'p1') blocks = blocksPage1(a);
  else if (step === 'p2') blocks = blocksPage2(a);
  else if (step === 'p3') blocks = blocksPage3(a);
  else if (step === 'p_puntos') blocks = blocksPagePuntos(a);
  else if (step === 'p5') blocks = blocksPage5(a);
  else blocks = blocksPage6(a);

  const nav = [];
  if (step !== 'p1') nav.push({ type: 'button', action_id: 'prev_page', text: { type: 'plain_text', text: '← Atrás' }, value: step });
  if (!isFinal) nav.push({ type: 'button', action_id: 'next_page', text: { type: 'plain_text', text: 'Siguiente →' }, value: step, style: 'primary' });

  const view = {
    type: 'modal',
    callback_id: isFinal ? 'promo_final_submit' : 'promo_step_view',
    private_metadata: JSON.stringify({ step, answers: a }),
    title: { type: 'plain_text', text: 'Solicitud de promo' },
    close: { type: 'plain_text', text: 'Cancelar' },
    blocks: [...blocks, ...(nav.length ? [{ type: 'actions', block_id: 'b_nav', elements: nav }] : [])],
  };
  if (isFinal) view.submit = { type: 'plain_text', text: 'Enviar' };
  return view;
}

// ── Abrir el modal ───────────────────────────────────────────
app.command('/promo-request', async ({ ack, body, client }) => {
  await ack();
  await client.views.open({
    trigger_id: body.trigger_id,
    view: buildView('p1', {}),
  });
});

// ── Navegación: Siguiente ────────────────────────────────────
app.action('next_page', async ({ ack, body, client }) => {
  await ack();
  const meta = JSON.parse(body.view.private_metadata || '{}');
  const merged = { ...meta.answers, ...extractStateValues(body.view.state.values) };
  const to = nextStep(meta.step, merged);
  await client.views.update({ view_id: body.view.id, hash: body.view.hash, view: buildView(to, merged) });
});

// ── Navegación: Atrás ────────────────────────────────────────
app.action('prev_page', async ({ ack, body, client }) => {
  await ack();
  const meta = JSON.parse(body.view.private_metadata || '{}');
  const merged = { ...meta.answers, ...extractStateValues(body.view.state.values) };
  const to = prevStep(meta.step, merged);
  await client.views.update({ view_id: body.view.id, hash: body.view.hash, view: buildView(to, merged) });
});

// ── Redibujo dentro de la misma pantalla (condicionales) ─────
app.action('audiencia_select', async ({ ack, body, client }) => {
  await ack();
  const meta = JSON.parse(body.view.private_metadata || '{}');
  const merged = { ...meta.answers, ...extractStateValues(body.view.state.values) };
  await client.views.update({ view_id: body.view.id, hash: body.view.hash, view: buildView('p5', merged) });
});

app.action('aprobado_select', async ({ ack, body, client }) => {
  await ack();
  const meta = JSON.parse(body.view.private_metadata || '{}');
  const merged = { ...meta.answers, ...extractStateValues(body.view.state.values) };
  await client.views.update({ view_id: body.view.id, hash: body.view.hash, view: buildView('p6', merged) });
});

// ── Submit final ─────────────────────────────────────────────
app.view('promo_final_submit', async ({ ack, body, client }) => {
  await ack();
  const meta = JSON.parse(body.view.private_metadata || '{}');
  const a = { ...meta.answers, ...extractStateValues(body.view.state.values) };

  // Resolver correo del requester
  let requesterEmail = '';
  try {
    const info = await client.users.info({ user: a.requester });
    requesterEmail = info.user.profile.email || '';
  } catch (err) {
    console.error('No se pudo resolver el correo del requester:', err);
  }

  // Determinar a quién etiquetar si no está aprobado
  let tagUser = null;
  if (a.aprobado === 'No') {
    tagUser = a.audiencia_no_aprobado === 'Nuevos' ? APPROVER_NEW_USERS : APPROVER_OTHER;
  }

  const payload = {
    secret: process.env.APPS_SCRIPT_SECRET,
    requesterEmail,
    ...a,
  };

  // Enviar a Apps Script (Google Sheets)
  try {
    await fetch(process.env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Error al escribir en Google Sheets vía Apps Script:', err);
  }

  // Mensaje de confirmación en el canal
  const aprobacionLinea = a.aprobado === 'Sí'
    ? `✅ Aprobado por <@${a.aprobado_por}>`
    : `⚠️ Pendiente de aprobación — atención <@${tagUser}>`;

  const resumen = [
    `🎟️ *Nueva solicitud de promoción*`,
    `Requester: <@${a.requester}> (${a.equipo})`,
    `Tipo: ${a.tipo} · Código: ${a.codigo || 'NA'}`,
    `Vigencia: ${a.fecha_inicio} – ${a.fecha_fin}`,
    aprobacionLinea,
  ].join('\n');

  if (process.env.SLACK_CHANNEL_ID) {
    await client.chat.postMessage({ channel: process.env.SLACK_CHANNEL_ID, text: resumen });
  }
});

(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`⚡ Promo Slack App corriendo en puerto ${port}`);
})();
