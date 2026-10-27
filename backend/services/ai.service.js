const { GoogleGenAI } = require('@google/genai');
const { GEMINI_API_KEY, GEMINI_MODEL_INVOICE, GEMINI_MODEL_CHAT } = require('../config/env');

function getClient() {
  if (!GEMINI_API_KEY) {
    const err = new Error(
      'GEMINI_API_KEY no esta configurada. Crea una key gratuita en https://aistudio.google.com/apikey y agregala en backend/.env para usar esta funcion.'
    );
    err.status = 503;
    throw err;
  }
  return new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

const INVOICE_TOOL = {
  type: 'function',
  name: 'record_invoice_items',
  description: 'Registra los items detectados en una factura de compra de insumos de barberia.',
  parameters: {
    type: 'object',
    properties: {
      supplier: { type: 'string', description: 'Nombre del proveedor/emisor de la factura, si aparece.' },
      invoiceNumber: { type: 'string', description: 'Numero o folio de la factura, si aparece.' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nombre del producto tal como aparece en la factura.' },
            quantity: { type: 'number', description: 'Cantidad comprada de ese item.' },
            unitCost: { type: 'number', description: 'Precio unitario NETO (sin IVA) en pesos chilenos, solo el numero.' },
          },
          required: ['name', 'quantity', 'unitCost'],
        },
      },
    },
    required: ['items'],
  },
};

// Lee una factura de compra (imagen o PDF, en base64) y devuelve los items
// detectados sin tocar la base de datos — el admin revisa/edita antes de
// confirmar (ver purchases.controller.js), asi un error de lectura de la IA
// no puede corromper el stock o los costos solo.
async function extractInvoiceItems({ base64, mediaType }) {
  const client = getClient();
  const isPdf = mediaType === 'application/pdf';

  const interaction = await client.interactions.create({
    model: GEMINI_MODEL_INVOICE,
    input: [
      {
        type: 'text',
        text: 'Esta es una factura de compra de insumos de barberia. Extrae cada linea de producto con su cantidad y precio unitario neto (sin IVA), tal como aparecen en la factura.',
      },
      isPdf
        ? { type: 'document', data: base64, mime_type: mediaType }
        : { type: 'image', data: base64, mime_type: mediaType },
    ],
    tools: [INVOICE_TOOL],
    generation_config: {
      tool_choice: { allowed_tools: { mode: 'any', tools: ['record_invoice_items'] } },
    },
  });

  const call = (interaction.steps || []).find((s) => s.type === 'function_call');
  if (!call) throw new Error('No se pudo extraer informacion de la factura. Intenta con una foto mas nitida.');
  return call.arguments;
}

// Chat de preguntas frecuentes para clientes del sitio publico. `businessInfo`
// se arma en el controller con datos reales (servicios/precios vigentes desde
// la base de datos), asi la IA no inventa precios.
async function chatWithAssistant({ messages, businessInfo }) {
  const client = getClient();
  const systemInstruction = `Eres el asistente virtual de Barber Linderos, una barberia. Responde en español, de forma breve, cercana y precisa, SOLO sobre servicios, precios, horarios, ubicacion, fidelizacion y la tienda de productos del negocio, usando exclusivamente la informacion de abajo. Si preguntan algo que no esta en esta informacion, dilo con honestidad en vez de inventar. Si quieren agendar, cancelar o ver disponibilidad real de horarios, indica que usen el boton "Reservar ahora" del sitio (no puedes reservar tu mismo). Responde en texto plano, sin markdown: no uses asteriscos, guiones de lista ni encabezados; separa ideas con saltos de linea normales.\n\nInformacion del negocio:\n${businessInfo}`;

  // La conversacion se aplana a un solo bloque de texto (en vez de reconstruir
  // el historial turno-por-turno) porque el formato exacto de historial de la
  // Interactions API para turnos previos del modelo no esta documentado de
  // forma confiable todavia; este enfoque es igual de efectivo y no depende
  // de un esquema que podria cambiar.
  const transcript = messages
    .map((m) => `${m.role === 'user' ? 'Cliente' : 'Asistente'}: ${m.content}`)
    .join('\n');

  const interaction = await client.interactions.create({
    model: GEMINI_MODEL_CHAT,
    system_instruction: systemInstruction,
    input: [{ type: 'text', text: transcript }],
  });

  return interaction.output_text || '';
}

module.exports = { extractInvoiceItems, chatWithAssistant };
