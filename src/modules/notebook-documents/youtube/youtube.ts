/** Regex copiée de `video.service.ts:92-97` (extractVideoId) — null si l'URL n'est pas une vidéo YouTube. */
export function extractVideoId(link: string): string | null {
  const regExp =
    /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
  const match = link.match(regExp);
  return match ? match[1] : null;
}
