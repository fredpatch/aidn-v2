/** STORAGE-0A - asks the API for a 5-minute signed link to a stored file,
 *  through the normal API client (session refresh and Origin header apply),
 *  then opens or downloads it natively. */
import { api } from './axios';
import { accessPathFor, type FileDisposition, type FileGrant } from './files';

export async function requestFileGrant(address: string, disposition: FileDisposition): Promise<FileGrant> {
  const path = accessPathFor(address);
  if (!path) throw new Error('FILE_ADDRESS_INVALID');
  const { data } = await api.post<FileGrant>(path, { disposition });
  return data;
}

/** Opens the file in a new tab (inline) or downloads it (attachment). The
 *  tab is opened synchronously on click so popup blockers allow it, then
 *  pointed at the signed link once the grant arrives. */
export async function openStoredFile(address: string, disposition: FileDisposition): Promise<void> {
  const tab = disposition === 'inline' ? window.open('', '_blank') : null;
  try {
    const grant = await requestFileGrant(address, disposition);
    if (tab) {
      tab.opener = null;
      tab.location.href = grant.url;
      return;
    }
    const link = document.createElement('a');
    link.href = grant.url;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (error) {
    tab?.close();
    throw error;
  }
}
