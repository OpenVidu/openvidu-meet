import { Pipe, PipeTransform } from '@angular/core';
import { ParticipantModel, ParticipantStream } from '../models/participant.model';

/**
 * The **RemoteParticipantTracksPipe** flattens all remote participants into a single array of
 * {@link ParticipantStream} objects. Each stream groups the video and audio tracks for a single
 * visual element (camera stream or screen-share stream) so the layout can render one DOM
 * element per stream instead of one per track.
 * @returns {ParticipantStream[]} Flat array of participant streams
 */
@Pipe({ name: 'tracks' })
export class RemoteParticipantTracksPipe implements PipeTransform {
	transform(participants: ParticipantModel[]): ParticipantStream[] {
		return participants.map((p) => p.streams()).flat();
	}
}
