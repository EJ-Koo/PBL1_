import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import type { Photo } from './journal';

function saveSelectedPhotos(result: ImagePicker.ImagePickerResult, limit: number): Photo[] {
  if (result.canceled) return [];
  const directory = Platform.OS !== 'web' ? new Directory(Paths.document, 'diary-photos') : null;
  directory?.create({ idempotent: true, intermediates: true });
  return result.assets.slice(0, limit).map((asset, index) => {
    const id = `photo-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
    if (Platform.OS === 'web') {
      if (!asset.base64) throw new Error('사진을 읽지 못했어요. 다른 사진을 선택해주세요.');
      return { id, uri: `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}` };
    }
    const source = new File(asset.uri);
    const destination = new File(directory!, `${id}${source.extension || '.jpg'}`);
    source.copy(destination);
    return { id, uri: destination.uri };
  });
}

export async function pickPhotos(limit: number): Promise<Photo[]> {
  if (limit <= 0) return [];
  // The system photo picker grants access only to selected photos; no broad library permission is needed.
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: limit,
    quality: 0.75, base64: Platform.OS === 'web',
  });
  return saveSelectedPhotos(result, limit);
}

// Android can recreate the activity while its system photo picker is open.
export async function recoverPendingPhotos(limit: number): Promise<Photo[]> {
  if (Platform.OS !== 'android' || limit <= 0) return [];
  const result = await ImagePicker.getPendingResultAsync();
  if (!result) return [];
  if ('code' in result) throw new Error(result.message || '선택한 사진을 복구하지 못했어요.');
  return saveSelectedPhotos(result, limit);
}
