// js/services/cotizacionFilesS3.js
// Adjuntos de cotizaciones (PDF / imágenes) en AWS S3 en lugar de base64 dentro del proyecto.
// - Se suben con URL prefirmada del servidor (/api/s3-presign) y se registran en archivos_almacen.
// - El proyecto solo guarda la llave S3 (ligero, respaldable y consultable desde cualquier equipo).
// - Sin conexión, el archivo se conserva temporalmente en base64 y se sube en cuanto sea posible.

import { getSupabaseClient, isSupabaseConfigured } from '../core/supabaseClient.js?v=20261119_cf38';
import { getProjectById, getCurrentUser } from '../modules/portal/projectService.js?v=20261119_cf38';
import { getActiveProjectId } from '../config/constants.js?v=20261119_cf38';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const inFlightUploads = new Set();

function getPresignApiUrl() {
  const customBase = (typeof window !== 'undefined' && window.__CUBIKAR_API_BASE__) ? String(window.__CUBIKAR_API_BASE__).replace(/\/+$/, '') : '';
  return `${customBase}/api/s3-presign`;
}

async function getSession() {
  if (!isSupabaseConfigured()) return null;
  const sb = getSupabaseClient();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    return data?.session || null;
  } catch (_) {
    return null;
  }
}

async function callPresign(payload, token) {
  const res = await fetch(getPresignApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl || '').split(',');
  if (parts.length !== 2 || !parts[0].startsWith('data:')) return null;
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const bstr = atob(parts[1]);
  const u8 = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

function extensionFor(fileName, mime) {
  const fromName = String(fileName || '').split('.').pop().toLowerCase();
  if (fromName && fromName.length <= 5 && fromName !== String(fileName || '').toLowerCase()) return fromName;
  if (/pdf/.test(mime)) return 'pdf';
  if (/png/.test(mime)) return 'png';
  if (/jpe?g/.test(mime)) return 'jpg';
  if (/webp/.test(mime)) return 'webp';
  return 'pdf';
}

export function isLegacyInlineAttachment(cot) {
  return Boolean(cot && !cot.archivoS3Key && typeof cot.archivoData === 'string' && cot.archivoData.startsWith('data:'));
}

/**
 * Sube a S3 el adjunto en base64 de una cotización. Devuelve { s3Key, archivoId, mimeType } o null.
 */
export async function uploadCotizacionAttachment({ dataUrl, fileName, projectId = null }) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  const blob = dataUrlToBlob(dataUrl);
  if (!blob || blob.size <= 0) return null;
  const session = await getSession();
  const token = session?.access_token;
  if (!token) return null;

  const localPid = projectId || getActiveProjectId();
  const project = localPid ? getProjectById(localPid) : null;
  const cloudId = UUID_RE.test(String(project?.cloudId || '')) ? project.cloudId : (UUID_RE.test(String(localPid || '')) ? localPid : '');
  const me = String(session.user?.email || getCurrentUser()?.email || '').toLowerCase().trim();
  const ownerEmail = String(project?.ownerEmail || me).toLowerCase().trim();
  const mimeType = blob.type || 'application/pdf';
  const ext = extensionFor(fileName, mimeType);
  const baseName = String(fileName || 'cotizacion').replace(/\.[a-z0-9]{1,5}$/i, '') || 'cotizacion';
  const safeName = `${baseName}.${ext}`;

  const presign = await callPresign({
    action: 'upload',
    fileName: safeName,
    mimeType,
    fileSizeBytes: blob.size,
    originalBytes: blob.size,
    modulo: 'compras',
    categoria: 'project_files',
    proyectoId: cloudId,
    ownerEmail
  }, token);
  if (!presign.ok || !presign.data?.uploadUrl) {
    console.warn('[CotizacionesS3] No se pudo firmar la subida:', presign.data?.error || presign.status);
    return null;
  }

  const put = await fetch(presign.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: blob });
  if (!put.ok) {
    console.warn('[CotizacionesS3] AWS S3 rechazó la subida:', put.status);
    return null;
  }

  let archivoId = '';
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb.from('archivos_almacen').upsert({
      proyecto_id: cloudId || String(localPid || ''),
      owner_email: ownerEmail,
      uploaded_by_email: me,
      modulo: 'compras',
      categoria: 'project_files',
      entidad_id: 'cotizacion',
      nombre_original: safeName,
      mime_type: mimeType,
      extension: ext,
      s3_bucket: presign.data.bucket || '',
      s3_key: presign.data.s3Key,
      tamano_original_bytes: blob.size,
      tamano_bytes: blob.size,
      metadata: { tipo: 'cotizacion' }
    }, { onConflict: 's3_key' }).select('id').single();
    if (!error) archivoId = data?.id || '';
  } catch (_) {}

  return { s3Key: presign.data.s3Key, archivoId, mimeType };
}

/**
 * Abre un adjunto guardado en S3 (URL prefirmada temporal).
 */
export async function openCotizacionAttachmentFromS3(cot) {
  const win = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  try {
    const session = await getSession();
    if (!session?.access_token) throw new Error('Inicia sesión para abrir el documento.');
    const res = await callPresign({ action: 'download', s3Key: cot.archivoS3Key }, session.access_token);
    if (!res.ok || !res.data?.downloadUrl) throw new Error(res.data?.error || 'No se pudo obtener el documento.');
    if (win) win.location.href = res.data.downloadUrl;
    else window.open(res.data.downloadUrl, '_blank');
    return true;
  } catch (err) {
    if (win) win.close();
    throw err;
  }
}

/**
 * Migra en segundo plano los adjuntos base64 de las cotizaciones de un concepto.
 * onUploaded(cotId, result) aplica el cambio en el estado del proyecto.
 */
export function migrateInlineAttachmentsInBackground(node, onUploaded) {
  if (!node || !Array.isArray(node.cotizaciones)) return;
  node.cotizaciones.filter(isLegacyInlineAttachment).forEach((cot) => {
    const key = `${node.id}|${cot.id}`;
    if (inFlightUploads.has(key)) return;
    inFlightUploads.add(key);
    uploadCotizacionAttachment({ dataUrl: cot.archivoData, fileName: cot.archivoNombre })
      .then((res) => { if (res) onUploaded(cot.id, res); })
      .catch((err) => console.warn('[CotizacionesS3] Migración pendiente:', err?.message || err))
      .finally(() => inFlightUploads.delete(key));
  });
}
