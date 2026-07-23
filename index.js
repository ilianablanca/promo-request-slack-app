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
const TIPOS_FORM_SIMPLE = ['fee0', 'downpayment0'];
const TIPOS_COMO_PROMOCODE = ['promocode', 'afiliados'];

const TIPO_OPTIONS = [
  { text: { type: 'plain_text', text: 'Promocode' }, value: 'promocode' },
  { text: { type: 'plain_text', text: 'Campaña de cashback' }, value: 'cashback' },
  { text: { type: 'plain_text', text: 'Reto' }, value: 'reto' },
  { text: { type: 'plain_text', text: 'Award' }, value: 'award' },
  { text: { type: 'plain_text', text: '0% fee' }, value: 'fee0' },
  { text: { type: 'plain_text', text: '0 downpayment' }, value: 'downpayment0' },
  { text: { type: 'plain_text', text: 'Descuento Afiliados' }, value: 'afiliados' },
  { text: { type: 'plain_text', text: 'Automática' }, value: 'automatica' },
  { text: { type: 'plain_text', text: 'Otro' }, value: 'otro' },
];

const BUSINESS_LINE_OPTIONS = ['BNPL', 'VC', 'PC', 'Walmart', 'Ali', 'Todos', 'Combo'];

const NA_HINT = { type: 'plain_text', text: 'Solo llenar si aplica. Si no, escribe NA.' };
const NUMERIC_RE = /^\d+(\.\d+)?$/;

const MERCHANT_ID_HINT = 'Escribe cada ID en su propio renglón (uno por línea). Para todos los comercios, escribe *promotionsall*.';
const MERCHANT_NAME_HINT = 'Escribe el nombre del merchant tal como quieres que aparezca en los T&C. Cualquier error ortográfico se verá reflejado ahí. Para más de un merchant, sepáralos por coma y espacio.';

function extractStateValues(values) {
  const result = {};
  for (const blockId in values) {
    for (const actionId in values[blockId]) {
      const el = values[blockId][actionId];
      if (el.type === 'plain_text_input') result[actionId] = el.value || '';
      else if (el.type === 'static_select') result[actionId] = el.selected_option ? el.selected_option.value : null;
      else if (el.type === 'multi_static_select') result[actionId] = (el.selected_options || []).map(o => o.value);
      else if (el.type === 'users_select') result[actionId] = el.selected_user || null;
      else if (el.type === 'multi_users_select') result[actionId] = el.selected_users || [];
      else if (el.type === 'datepicker') result[actionId] = el.selected_date || null;
    }
  }
  return result;
}

function opt(text, value) { return { text: { type: 'plain_text', text }, value }; }
function findOpt(options, value) { return options.find(o => o.value === value); }
function findOpts(options, values) { return options.filter(o => (values || []).includes(o.value)); }
function reqLabel(text) { return { type: 'plain_text', text: `${text} *` }; }
function hintBlock(text) { return { type: 'context', elements: [{ type: 'mrkdwn', text }] }; }

function blocksPage1(a) {
  return [
    { type: 'input', block_id: 'b_requester', label: reqLabel('Requester'),
      element: { type: 'users_select', action_id: 'requester', ...(a.requester ? { initial_user: a.requester } : {}) } },
    { type: 'input', block_id: 'b_equipo', label: reqLabel('Equipo del requester'),
      element: { type: 'static_select', action_id: 'equipo',
        options: ['Business Development', 'Growth', 'KAMs', 'Risk', 'Merch Ops', 'Marketing', 'Affiliates'].map(t => opt(t, t)),
        ...(a.equipo ? { initial_option: opt(a.equipo, a.equipo) } : {}) } },
    { type: 'input', block_id: 'b_tipo', label: reqLabel('Tipo de promoción'),
      element: { type: 'static_select', action_id: 'tipo',
        options: TIPO_OPTIONS,
        ...(a.tipo ? { initial_option: findOpt(TIPO_OPTIONS, a.tipo) } : {}) } },
  ];
}

function blocksPage2(a) {
  const codigoOptional = !TIPOS_COMO_PROMOCODE.includes(a.tipo);
  return [
    { type: 'input', block_id: 'b_tipo_descuento', label: reqLabel('Tipo de descuento'),
      element: { type: 'static_select', action_id: 'tipo_descuento',
        options: ['%', '$', 'Otro'].map(t => opt(t, t)),
        ...(a.tipo_descuento ? { initial_option: opt(a.tipo_descuento, a.tipo_descuento) } : {}) } },
    { type: 'input', block_id: 'b_valor_descuento', label: reqLabel('Valor del descuento'),
      element: { type: 'plain_text_input', action_id: 'valor_descuento',
        placeholder: { type: 'plain_text', text: 'Solo números, ej. 25' },
        ...(a.valor_descuento ? { initial_value: a.valor_descuento } : {}) } },
    hintBlock('Escribe solo el número (sin % ni $).'),
    { type: 'input', block_id: 'b_codigo', label: codigoOptional ? { type: 'plain_text', text: 'Código del cupón o campaña' } : reqLabel('Código del cupón o campaña'),
      optional: codigoOptional,
      element: { type: 'plain_text_input', action_id: 'codigo', placeholder: { type: 'plain_text', text: 'NA si no aplica' }, ...(a.codigo ? { initial_value: a.codigo } : {}) } },
    { type: 'input', block_id: 'b_minimo_compra', label: { type: 'plain_text', text: 'Mínimo de compra' }, optional: true,
      element: { type: 'plain_text_input', action_id: 'minimo_compra', placeholder: { type: 'plain_text', text: 'NA si no aplica' }, ...(a.minimo_compra ? { initial_value: a.minimo_compra } : {}) } },
    { type: 'input', block_id: 'b_maximo_descuento', label: { type: 'plain_text', text: 'Descuento máximo' }, optional: true,
      element: { type: 'plain_text_input', action_id: 'maximo_descuento', placeholder: { type: 'plain_text', text: 'NA si no aplica' }, ...(a.maximo_descuento ? { initial_value: a.maximo_descuento } : {}) } },
    { type: 'input', block_id: 'b_merchant_name_compra', label: reqLabel('Merchant name'),
      element: { type: 'plain_text_input', action_id: 'merchant_name_compra', multiline: true, ...(a.merchant_name_compra ? { initial_value: a.merchant_name_compra } : {}) } },
    hintBlock(MERCHANT_NAME_HINT),
    { type: 'input', block_id: 'b_merchant_id_compra', label: reqLabel('Merchant id'),
      element: { type: 'plain_text_input', action_id: 'merchant_id_compra', multiline: true, ...(a.merchant_id_compra ? { initial_value: a.merchant_id_compra } : {}) } },
    hintBlock(MERCHANT_ID_HINT),
    { type: 'input', block_id: 'b_merchant_channel', label: reqLabel('Merchant channel'),
      element: { type: 'static_select', action_id: 'merchant_channel',
        options: ['Online', 'Offline', 'Ambos'].map(t => opt(t, t)),
        ...(a.merchant_channel ? { initial_option: opt(a.merchant_channel, a.merchant_channel) } : {}) } },
  ];
}

function blocksPage3(a) {
  return [
    { type: 'input', block_id: 'b_fecha_inicio', label: reqLabel('Fecha inicio'),
      element: { type: 'datepicker', action_id: 'fecha_inicio', ...(a.fecha_inicio ? { initial_date: a.fecha_inicio } : {}) } },
    { type: 'input', block_id: 'b_fecha_fin', label: reqLabel('Fecha fin'),
      element: { type: 'datepicker', action_id: 'fecha_fin', ...(a.fecha_fin ? { initial_date: a.fecha_fin } : {}) } },
    { type: 'input', block_id: 'b_horas_dia', label: reqLabel('Horas del día'),
      element: { type: 'plain_text_input', action_id: 'horas_dia', placeholder: { type: 'plain_text', text: 'Ej. Todo el día, o 09:00-22:00' }, ...(a.horas_dia ? { initial_value: a.horas_dia } : {}) } },
    { type: 'input', block_id: 'b_usos_totales', label: { type: 'plain_text', text: 'Usos totales' }, optional: true,
      element: { type: 'plain_text_input', action_id: 'usos_totales', placeholder: { type: 'plain_text', text: 'NA si no aplica' }, ...(a.usos_totales ? { initial_value: a.usos_totales } : {}) } },
    { type: 'input', block_id: 'b_usos_por_usuario', label: reqLabel('Usos por usuario'),
      element: { type: 'plain_text_input', action_id: 'usos_por_usuario', ...(a.usos_por_usuario ? { initial_value: a.usos_por_usuario } : {}) } },
  ];
}

function blocksPagePuntos(a) {
  return [
    { type: 'section', text: { type: 'mrkdwn', text: '_Esta promoción involucra puntos — completa lo siguiente:_' } },
    { type: 'input', block_id: 'b_merchant_name_gasto', label: reqLabel('Merchant name gasto de puntos'),
      element: { type: 'plain_text_input', action_id: 'merchant_name_gasto', multiline: true, ...(a.merchant_name_gasto ? { initial_value: a.merchant_name_gasto } : {}) } },
    hintBlock('Separa los nombres con coma y espacio.'),
    { type: 'input', block_id: 'b_merchant_id_gasto', label: reqLabel('Merchant id gasto de puntos'),
      element: { type: 'plain_text_input', action_id: 'merchant_id_gasto', multiline: true, ...(a.merchant_id_gasto ? { initial_value: a.merchant_id_gasto } : {}) } },
    hintBlock(MERCHANT_ID_HINT),
    { type: 'input', block_id: 'b_minimo_compra_gasto', label: { type: 'plain_text', text: 'Compra mínima para gastar puntos' }, optional: true,
      element: { type: 'plain_text_input', action_id: 'minimo_compra_gasto', placeholder: NA_HINT, ...(a.minimo_compra_gasto ? { initial_value: a.minimo_compra_gasto } : {}) } },
    { type: 'input', block_id: 'b_vigencia_puntos', label: reqLabel('Vigencia de los puntos'),
      element: { type: 'plain_text_input', action_id: 'vigencia_puntos', placeholder: { type: 'plain_text', text: 'Ej. 90 días, o del 8 de julio al 10 de julio' }, ...(a.vigencia_puntos ? { initial_value: a.vigencia_puntos } : {}) } },
    hintBlock('Puedes indicar la *duración del gasto de puntos* (ej. 90 días) o el *rango de vigencia de los puntos* (ej. del 8 de julio al 10 de julio) — lo que aplique a esta promoción.'),
    { type: 'input', block_id: 'b_descripcion_campana', label: { type: 'plain_text', text: 'Descripción de la campaña' }, optional: true,
      element: { type: 'plain_text_input', action_id: 'descripcion_campana', multiline: true, ...(a.descripcion_campana ? { initial_value: a.descripcion_campana } : {}) } },
    hintBlock('Leyenda de la promoción que le aparecerá al usuario en su app.'),
  ];
}

function blocksPageSimple(a) {
  return [
    { type: 'input', block_id: 'b_minimo_compra_simple', label: reqLabel('Monto mínimo de compra'),
      element: { type: 'plain_text_input', action_id: 'minimo_compra_simple', ...(a.minimo_compra_simple ? { initial_value: a.minimo_compra_simple } : {}) } },
    { type: 'input', block_id: 'b_fecha_inicio_simple', label: reqLabel('Fecha inicio'),
      element: { type: 'datepicker', action_id: 'fecha_inicio', ...(a.fecha_inicio ? { initial_date: a.fecha_inicio } : {}) } },
    { type: 'input', block_id: 'b_fecha_fin_simple', label: reqLabel('Fecha fin'),
      element: { type: 'datepicker', action_id: 'fecha_fin', ...(a.fecha_fin ? { initial_date: a.fecha_fin } : {}) } },
    { type: 'input', block_id: 'b_merchant_name_simple', label: reqLabel('Merchant name'),
      element: { type: 'plain_text_input', action_id: 'merchant_name_simple', multiline: true, ...(a.merchant_name_simple ? { initial_value: a.merchant_name_simple } : {}) } },
    hintBlock(MERCHANT_NAME_HINT),
    { type: 'input', block_id: 'b_merchant_id_simple', label: reqLabel('Merchant id'),
      element: { type: 'plain_text_input', action_id: 'merchant_id_simple', multiline: true, ...(a.merchant_id_simple ? { initial_value: a.merchant_id_simple } : {}) } },
    hintBlock(MERCHANT_ID_HINT),
    { type: 'input', block_id: 'b_usuarios_simple', label: reqLabel('Usuarios a los que aplica'),
      element: { type: 'plain_text_input', action_id: 'usuarios_simple', placeholder: { type: 'plain_text', text: 'Ej. Bandas de riesgo A y B' }, ...(a.usuarios_simple ? { initial_value: a.usuarios_simple } : {}) } },
    { type: 'input', block_id: 'b_merchant_channel_simple', label: reqLabel('Merchant channel'),
      element: { type: 'static_select', action_id: 'merchant_channel_simple',
        options: ['Online', 'Offline', 'Ambos'].map(t => opt(t, t)),
        ...(a.merchant_channel_simple ? { initial_option: opt(a.merchant_channel_simple, a.merchant_channel_simple) } : {}) } },
    { type: 'input', block_id: 'b_business_line_simple', label: reqLabel('Merchant business line'),
      element: { type: 'multi_static_select', action_id: 'business_line_simple',
        options: BUSINESS_LINE_OPTIONS.map(t => opt(t, t)),
        ...(a.business_line_simple && a.business_line_simple.length ? { initial_options: findOpts(BUSINESS_LINE_OPTIONS.map(t => opt(t, t)), a.business_line_simple) } : {}) } },
    { type: 'input', block_id: 'b_pay_now_simple', label: reqLabel('¿Incluye Pay Now?'),
      element: { type: 'static_select', action_id: 'pay_now_simple',
        options: ['Sí', 'No'].map(t => opt(t, t)),
        ...(a.pay_now_simple ? { initial_option: opt(a.pay_now_simple, a.pay_now_simple) } : {}) } },
  ];
}

function blocksPage5(a) {
  const blocks = [
    { type: 'input', block_id: 'b_business_line', label: reqLabel('Business line'),
      element: { type: 'multi_static_select', action_id: 'business_line',
        options: BUSINESS_LINE_OPTIONS.map(t => opt(t, t)),
        ...(a.business_line && a.business_line.length ? { initial_options: findOpts(BUSINESS_LINE_OPTIONS.map(t => opt(t, t)), a.business_line) } : {}) } },
    { type: 'input', block_id: 'b_audiencia', label: reqLabel('Audiencia'), dispatch_action: true,
      element: { type: 'static_select', action_id: 'audiencia',
        options: ['Nuevos', 'Recurrentes', 'Todos', 'Segmento específico'].map(t => opt(t, t)),
        ...(a.audiencia ? { initial_option: opt(a.audiencia, a.audiencia) } : {}) } },
  ];
  if (a.audiencia === 'Segmento específico') {
    blocks.push({ type: 'input', block_id: 'b_audiencia_especifica', label: reqLabel('Especifica el segmento'),
      element: { type: 'plain_text_input', action_id: 'audiencia_especifica', ...(a.audiencia_especifica ? { initial_value: a.audiencia_especifica } : {}) } });
  }
  blocks.push({ type: 'input', block_id: 'b_pay_now', label: reqLabel('¿Incluye Pay Now?'),
    element: { type: 'static_select', action_id: 'pay_now',
      options: ['Sí', 'No'].map(t => opt(t, t)),
      ...(a.pay_now ? { initial_option: opt(a.pay_now, a.pay_now) } : {}) } });
  return blocks;
}

function blocksPage6(a) {
  const blocks = [
    { type: 'input', block_id: 'b_comentarios', label: { type: 'plain_text', text: 'Comentarios adicionales' }, optional: true,
      element: { type: 'plain_text_input', action_id: 'comentarios', multiline: true,
        placeholder: { type: 'plain_text', text: 'Ej. cupón válido para merchant X en fecha Y, y merchant Z en fecha W; o lista/segmento específico de usuarios' },
        ...(a.comentarios ? { initial_value: a.comentarios } : {}) } },
    { type: 'input', block_id: 'b_aprobado', label: reqLabel('¿El descuento ya fue aprobado?'), dispatch_action: true,
      element: { type: 'static_select', action_id: 'aprobado',
        options: ['Sí', 'No'].map(t => opt(t, t)),
        ...(a.aprobado ? { initial_option: opt(a.aprobado, a.aprobado) } : {}) } },
  ];
  if (a.aprobado === 'Sí') {
    blocks.push({ type: 'input', block_id: 'b_aprobado_por', label: reqLabel('¿Por quién?'),
      element: { type: 'plain_text_input', action_id: 'aprobado_por', ...(a.aprobado_por ? { initial_value: a.aprobado_por } : {}) } });
  }
  return blocks;
}

function needsPuntos(a) { return TIPOS_CON_PUNTOS.includes(a.tipo); }
function isFormSimple(a) { return TIPOS_FORM_SIMPLE.includes(a.tipo); }

function nextStep(step, a) {
  if (step === 'p1') return isFormSimple(a) ? 'p_simple' : 'p2';
  if (step === 'p_simple') return 'p6';
  if (step === 'p2') return 'p3';
  if (step === 'p3') return needsPuntos(a) ? 'p_puntos' : 'p5';
  if (step === 'p_puntos') return 'p5';
  if (step === 'p5') return 'p6';
  return 'p6';
}

function prevStep(step, a) {
  if (step === 'p_simple') return 'p1';
  if (step === 'p2') return 'p1';
  if (step === 'p3') return 'p2';
  if (step === 'p_puntos') return 'p3';
  if (step === 'p5') return needsPuntos(a) ? 'p_puntos' : 'p3';
  if (step === 'p6') return isFormSimple(a) ? 'p_simple' : 'p5';
  return 'p1';
}

function buildView(step, a) {
  const isFinal = step === 'p6';
  let blocks;
  if (step === 'p1') blocks = blocksPage1(a);
  else if (step === 'p_simple') blocks = blocksPageSimple(a);
  else if (step === 'p2') blocks = blocksPage2(a);
  else if (step === 'p3') blocks = blocksPage3(a);
  else if (step === 'p_puntos') blocks = blocksPagePuntos(a);
  else if (step === 'p5') blocks = blocksPage5(a);
  else blocks = blocksPage6(a);

  const nav = [];
  if (step !== 'p1') nav.push({ type: 'button', action_id: 'prev_page', text: { type: 'plain_text', text: '← Atrás' }, value: step });

  return {
    type: 'modal',
    callback_id: isFinal ? 'promo_final_submit' : 'promo_step_view',
    private_metadata: JSON.stringify({ step, answers: a }),
    title: { type: 'plain_text', text: 'Solicitud de promo' },
    close: { type: 'plain_text', text: 'Cancelar' },
    submit: { type: 'plain_text', text: isFinal ? 'Enviar' : 'Siguiente' },
    blocks: [...blocks, ...(nav.length ? [{ type: 'actions', block_id: 'b_nav', elements: nav }] : [])],
  };
}

function validatePage2(a) {
  const errors = {};
  if (a.valor_descuento && !NUMERIC_RE.test(a.valor_descuento)) errors['b_valor_descuento'] = 'Escribe solo un número (sin % ni $).';
  if (a.minimo_compra && a.minimo_compra.toUpperCase() !== 'NA' && !NUMERIC_RE.test(a.minimo_compra)) errors['b_minimo_compra'] = 'Escribe solo un número, o NA si no aplica.';
  if (a.maximo_descuento && a.maximo_descuento.toUpperCase() !== 'NA' && !NUMERIC_RE.test(a.maximo_descuento)) errors['b_maximo_descuento'] = 'Escribe solo un número, o NA si no aplica.';
  return errors;
}

app.command('/promo-request', async ({ ack, body, client }) => {
  await ack();
  await client.views.open({ trigger_id: body.trigger_id, view: buildView('p1', {}) });
});

app.view('promo_step_view', async ({ ack, body }) => {
  const meta = JSON.parse(body.view.private_metadata || '{}');
  const merged = { ...meta.answers, ...extractStateValues(body.view.state.values) };
  if (meta.step === 'p2') {
    const errors = validatePage2(merged);
    if (Object.keys(errors).length) {
      await ack({ response_action: 'errors', errors });
      return;
    }
  }
  const to = nextStep(meta.step, merged);
  await ack({ response_action: 'update', view: buildView(to, merged) });
});

app.action('prev_page', async ({ ack, body, client }) => {
  await ack();
  const meta = JSON.parse(body.view.private_metadata || '{}');
  const merged = { ...meta.answers, ...extractStateValues(body.view.state.values) };
  const to = prevStep(meta.step, merged);
  await client.views.update({ view_id: body.view.id, hash: body.view.hash, view: buildView(to, merged) });
});

app.action('audiencia', async ({ ack, body, client }) => {
  await ack();
  const meta = JSON.parse(body.view.private_metadata || '{}');
  const merged = { ...meta.answers, ...extractStateValues(body.view.state.values) };
  await client.views.update({ view_id: body.view.id, hash: body.view.hash, view: buildView(meta.step, merged) });
});

app.action('aprobado', async ({ ack, body, client }) => {
  await ack();
  const meta = JSON.parse(body.view.private_metadata || '{}');
  const merged = { ...meta.answers, ...extractStateValues(body.view.state.values) };
  await client.views.update({ view_id: body.view.id, hash: body.view.hash, view: buildView(meta.step, merged) });
});

app.view('promo_final_submit', async ({ ack, body, client }) => {
  await ack();
  const meta = JSON.parse(body.view.private_metadata || '{}');
  const a = { ...meta.answers, ...extractStateValues(body.view.state.values) };

  let requesterEmail = '';
  try {
    const info = await client.users.info({ user: a.requester });
    requesterEmail = info.user.profile.email || '';
  } catch (err) {
    console.error('No se pudo resolver el correo del requester:', err);
  }

  let tagUser = null;
  if (a.aprobado === 'No') {
    tagUser = a.audiencia === 'Nuevos' ? APPROVER_NEW_USERS : APPROVER_OTHER;
  }

  const payload = {
    secret: process.env.APPS_SCRIPT_SECRET,
    requesterEmail,
    ...a,
    business_line: Array.isArray(a.business_line) ? a.business_line.join(', ') : a.business_line,
    business_line_simple: Array.isArray(a.business_line_simple) ? a.business_line_simple.join(', ') : a.business_line_simple,
  };

  try {
    const res = await fetch(process.env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    console.log('Respuesta de Apps Script:', text);
  } catch (err) {
    console.error('Error al escribir en Google Sheets vía Apps Script:', err);
  }

  const aprobacionLinea = a.aprobado === 'Sí'
    ? `✅ Descuento ya aprobado por ${a.aprobado_por || 'N/A'}`
    : `⚠️ Pendiente de aprobación — atención <@${tagUser}>`;

  const resumen = [
    `🎟️ *Nueva solicitud de promoción*`,
    `Requester: <@${a.requester}> (${a.equipo})`,
    isFormSimple(a) ? `Tipo: ${a.tipo}` : `Tipo: ${a.tipo} · Código: ${a.codigo || 'NA'}`,
    `Vigencia: ${a.fecha_inicio} – ${a.fecha_fin}`,
    aprobacionLinea,
  ].join('\n');

  if (process.env.SLACK_CHANNEL_ID) {
    try {
      await client.chat.postMessage({ channel: process.env.SLACK_CHANNEL_ID, text: resumen });
    } catch (err) {
      console.error('Error al mandar el mensaje de confirmación a Slack:', err);
    }
  } else {
    console.log('SLACK_CHANNEL_ID no está configurado — se omite el mensaje de confirmación.');
  }
});

(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`⚡ Promo Slack App corriendo en puerto ${port}`);
})();
