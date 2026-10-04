// Version 12 – day-wise photos, saree donors and the saree auction.
// Pictures are saved in the public "assets" storage (photos/…, sarees/…, auction/…); the admin uploads them,
// team members and visitors see them through their public web address.
import { supabase } from './supabase.js';
import { compressImage, imageExt } from './image.js';

/** Public web address of a saved picture ('' when there is none). */
export const imageUrl = (path) => (path && supabase ? supabase.storage.from('assets').getPublicUrl(path).data.publicUrl : '');

/** Shrinks a phone photo and saves it under assets/<folder>/…; returns the saved path. */
export async function uploadPicture(file, folder) {
  const blob = await compressImage(file, 1600, 0.8);
  const type = blob.type || 'image/jpeg';
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${imageExt(type)}`;
  const { error } = await supabase.storage.from('assets').upload(path, blob, { contentType: type, cacheControl: '31536000' });
  if (error) throw error;
  return path;
}

/** Removes pictures from storage (best effort – a leftover file does no harm). */
export async function removePictures(paths) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return;
  try { await supabase.storage.from('assets').remove(list); } catch { /* ignore */ }
}

/** A table / function that is missing until the database update (version 12). */
export const isMissing = (e) => !!e && (['PGRST205', 'PGRST202', '42P01', '42883'].includes(e.code)
  || /schema cache|does not exist|Could not find the (table|function)/i.test(String(e.message || '')));

/** Amount box text → number (null when empty). */
export function toAmount(v) {
  const s = String(v ?? '').replace(/[^0-9.]/g, '');
  if (!s) return null;
  const n = Math.round(Number(s) * 100) / 100;
  return Number.isFinite(n) ? n : null;
}
