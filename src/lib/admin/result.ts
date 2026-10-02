import type { ImportPreview } from '$lib/types';
import type { MusicProvider } from '$lib/music-import';

export type AdminSuccessResult = {
  kind: 'success';
  adminMessage: string;
};

export type AdminPreviewReadyResult = {
  kind: 'preview-ready';
  adminMessage: string;
  importPreview: ImportPreview;
};

export type AdminErrorResult = {
  kind: 'error';
  adminError: string;
};

export type AdminPreviewParseErrorResult = {
  musicInput?: string;
  provider?: MusicProvider;
  kind: 'preview-parse-error';
  adminError: string;
  songImport?: { songInput: string };
  playlistImport?: { playlistInput: string };
};

export type AdminPreviewImportErrorResult = {
  kind: 'preview-import-error';
  adminError: string;
  importPreview: ImportPreview;
};

export type AdminProfileErrorResult = {
  kind: 'profile-error';
  adminError: string;
};

export type AdminActionResult =
  | AdminSuccessResult
  | AdminPreviewReadyResult
  | AdminErrorResult
  | AdminPreviewParseErrorResult
  | AdminPreviewImportErrorResult
  | AdminProfileErrorResult;

export type AdminActionForm = AdminActionResult | null | undefined;

export const hasAdminMessage = (form: AdminActionForm): form is AdminSuccessResult | AdminPreviewReadyResult =>
  form?.kind === 'success' || form?.kind === 'preview-ready';

export const hasToastableError = (form: AdminActionForm): form is AdminErrorResult | AdminPreviewParseErrorResult =>
  form?.kind === 'error' || form?.kind === 'preview-parse-error';

export const hasImportPreview = (
  form: AdminActionForm
): form is AdminPreviewReadyResult | AdminPreviewImportErrorResult =>
  form?.kind === 'preview-ready' || form?.kind === 'preview-import-error';

export const startsOnNeteasePanel = (form: AdminActionForm) =>
  form?.kind === 'preview-ready' || form?.kind === 'preview-import-error' || form?.kind === 'preview-parse-error';

export const getImportProvider = (form: AdminActionForm): MusicProvider =>
  hasImportPreview(form)
    ? (form.importPreview.provider ?? 'netease')
    : form?.kind === 'preview-parse-error'
      ? (form.provider ?? 'netease')
      : 'netease';

export const getSongInputEcho = (form: AdminActionForm) =>
  form?.kind === 'preview-parse-error'
    ? (form.songImport?.songInput ?? '')
    : hasImportPreview(form) && form.importPreview.sourceKind === 'song'
      ? form.importPreview.sourceInput
      : '';

export const getPlaylistInputEcho = (form: AdminActionForm) => {
  if (form?.kind === 'preview-parse-error' && form.playlistImport) {
    return form.playlistImport.playlistInput;
  }
  if (hasImportPreview(form) && form.importPreview.sourceKind === 'playlist') {
    return form.importPreview.sourceInput;
  }
  return '';
};
