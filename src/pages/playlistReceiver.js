// A server claim prevents two tabs from appending the same item to MusicKit.
// Never repeat a MusicKit write just because its acknowledgement was lost.
export async function receiveApple(api, music, isActive = () => true) {
  const { delivery } = await api.queueClaimApple();
  if (!delivery) return false;
  const { item, claim } = delivery;
  let delivered = false;
  try {
    if (!isActive()) return false;
    const descriptor = { song: item.apple_catalog_id };
    if (music.queue?.items?.length) await music.playLater(descriptor);
    else await music.setQueue(descriptor);
    delivered = true;
  } finally {
    await api.queueAppleAck(item.id, claim, delivered);
  }
  return delivered;
}
