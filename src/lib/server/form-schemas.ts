import { z } from 'zod';
import { zfd } from 'zod-form-data';

import {
  pageSettingsSchema,
  playlistImportSettingsSchema,
  playlistSongImportSchema,
  requestDecisionSchema,
  songSchema,
  tagsInputSchema
} from '$lib/validators';
import { mergeTags, parseTags } from '$lib/tags';

const formText = z.string().default('');
export const maxPlaylistImportSongCount = 5000;
const playlistImportSongCountMessage = `单次最多导入 ${maxPlaylistImportSongCount} 首歌曲。`;
const playlistImportShapeMessage = '导入表单数据不完整，请重新解析歌单。';
const playlistImportTextRows = z.array(formText).max(maxPlaylistImportSongCount, playlistImportSongCountMessage);
const playlistImportSelectedRows = z
  .array(zfd.numeric(z.number().int().min(0)))
  .max(maxPlaylistImportSongCount, playlistImportSongCountMessage);
const playlistImportPreviewSongSchema = z.object({
  title: formText,
  artist: formText,
  language: formText,
  tagsInput: formText
});

export const requestFormValuesSchema = zfd.formData({
  songInput: formText,
  songTitle: formText,
  artist: formText,
  language: formText,
  message: formText,
  requesterName: formText
});

export const songPreviewFormValuesSchema = zfd.formData({
  songInput: formText
});

export const playlistPreviewFormValuesSchema = zfd.formData({
  playlistInput: formText
});

export const songFormSchema = zfd
  .formData({
    id: zfd.text(z.string().optional()),
    title: formText,
    artist: formText,
    language: formText,
    status: formText,
    tagsInput: formText,
    isPublic: zfd.checkbox()
  })
  .pipe(songSchema);

export const deleteSongFormSchema = zfd.formData({
  id: formText.pipe(z.string().trim().min(1, '缺少歌曲 ID。'))
});

export const bulkTagSongsFormSchema = zfd
  .formData({
    id: zfd.repeatable(z.array(z.string().uuid()).min(1, '请至少选择一首歌曲。').max(5000)),
    tagsInput: formText.pipe(tagsInputSchema).refine((tags) => tags.length > 0, '请选择或输入至少一个标签。')
  })
  .transform(({ id, tagsInput }) => ({ ids: [...new Set(id)], tags: tagsInput }));

export const bulkUpdateSongsFormSchema = zfd
  .formData({
    bulkAction: z.enum(['delete', 'setPublic', 'setPrivate'], {
      error: '未知的批量操作。'
    }),
    id: zfd.repeatableOfType(z.string())
  })
  .transform(({ id, ...data }) => ({
    ...data,
    ids: id.filter(Boolean)
  }));

export const playlistImportFormValuesSchema = zfd
  .formData({
    status: formText.pipe(playlistImportSettingsSchema.shape.status),
    sourceInput: formText,
    sharedTagsInput: formText,
    selectedSong: zfd.repeatable(playlistImportSelectedRows),
    songTitle: zfd.repeatable(playlistImportTextRows),
    songArtist: zfd.repeatable(playlistImportTextRows),
    songLanguage: zfd.repeatable(playlistImportTextRows),
    songTagsInput: zfd.repeatable(playlistImportTextRows)
  })
  .superRefine(({ selectedSong, songTitle, songArtist, songLanguage, songTagsInput }, ctx) => {
    const rowCount = songTitle.length;
    const rowFields = [
      ['songArtist', songArtist],
      ['songLanguage', songLanguage],
      ['songTagsInput', songTagsInput]
    ] as const;

    for (const [fieldName, rows] of rowFields) {
      if (rows.length !== rowCount) {
        ctx.addIssue({
          code: 'custom',
          path: [fieldName],
          message: playlistImportShapeMessage
        });
      }
    }

    if (new Set(selectedSong).size !== selectedSong.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['selectedSong'],
        message: playlistImportShapeMessage
      });
    }

    if (selectedSong.some((index) => index >= rowCount)) {
      ctx.addIssue({
        code: 'custom',
        path: ['selectedSong'],
        message: playlistImportShapeMessage
      });
    }
  })
  .transform(
    ({ status, sourceInput, sharedTagsInput, selectedSong, songTitle, songArtist, songLanguage, songTagsInput }) => {
      const songs = songTitle.map((title, index) => ({
        title,
        artist: songArtist[index],
        language: songLanguage[index],
        tagsInput: songTagsInput[index]
      }));
      const selectedIndexes = new Set(selectedSong);

      return {
        status,
        importPreview: {
          sourceInput,
          sharedTagsInput,
          status,
          songs
        },
        selectedSongs: songs.filter((_, index) => selectedIndexes.has(index))
      };
    }
  );

export const playlistImportPayloadSchema = z
  .object({
    status: playlistImportSettingsSchema.shape.status,
    importPreview: z.object({
      sourceInput: formText,
      sharedTagsInput: formText,
      status: playlistImportSettingsSchema.shape.status,
      songs: z.array(playlistImportPreviewSongSchema).max(maxPlaylistImportSongCount, playlistImportSongCountMessage)
    }),
    selectedSongs: z.array(playlistImportPreviewSongSchema).min(1, '请选择至少一首歌。')
  })
  .superRefine(({ importPreview, selectedSongs }, ctx) => {
    const shared = tagsInputSchema.safeParse(importPreview.sharedTagsInput);
    if (!shared.success) {
      ctx.addIssue({ code: 'custom', message: shared.error.issues[0].message });
      return;
    }
    for (const song of selectedSongs) {
      const parsed = playlistSongImportSchema.safeParse({
        ...song,
        tagsInput: mergeTags(parseTags(song.tagsInput), shared.data).join(', ')
      });
      if (!parsed.success)
        ctx.addIssue({ code: 'custom', message: `${song.title}：${parsed.error.issues[0].message}` });
    }
  })
  .transform(({ importPreview, selectedSongs, status }) => ({
    importPreview,
    songsToImport: selectedSongs.map((song) => ({
      ...playlistSongImportSchema.parse({
        ...song,
        tagsInput: mergeTags(parseTags(song.tagsInput), parseTags(importPreview.sharedTagsInput)).join(', ')
      }),
      status,
      isPublic: true
    }))
  }));

export const requestDecisionFormSchema = zfd.formData({
  id: formText.pipe(requestDecisionSchema.shape.id),
  status: formText.pipe(requestDecisionSchema.shape.status)
});

export const profileFormSchema = zfd
  .formData({
    heroTitle: formText,
    bilibiliUrl: formText,
    avatar: zfd.file(z.instanceof(File).optional()),
    background: zfd.file(z.instanceof(File).optional())
  })
  .pipe(
    pageSettingsSchema.extend({
      avatar: z.instanceof(File).optional(),
      background: z.instanceof(File).optional()
    })
  );

export const loginFormSchema = zfd.formData({
  email: formText,
  password: formText
});
