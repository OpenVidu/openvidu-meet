/**
 * What one destination costs the server in upload while a broadcast runs, in Mbps: the 720p preset
 * every broadcast is encoded with (3000 kbps of video plus 128 kbps of audio), sent once per
 * destination. Shown wherever destinations are chosen, so nobody takes streaming to be free.
 */
export const BROADCAST_MBPS_PER_DESTINATION = 3;
