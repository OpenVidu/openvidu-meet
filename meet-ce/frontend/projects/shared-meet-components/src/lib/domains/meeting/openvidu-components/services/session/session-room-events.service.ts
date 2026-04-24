import { Injectable, inject } from '@angular/core';
import { DataTopic } from '../../models/data-topic.model';
import { ParticipantLeftEvent, ParticipantLeftReason } from '../../models/participant.model';
import { RecordingState } from '../../models/recording.model';
import { RoomStatusData } from '../../models/room.model';
import {
	DataPacket_Kind,
	DisconnectReason,
	LocalParticipant,
	Participant,
	RemoteParticipant,
	RemoteTrack,
	RemoteTrackPublication,
	Room,
	RoomEvent,
	Track,
	TrackPublication
} from '../../services/livekit-adapter';
import { safeJsonParse } from '../../utils/utils';
import { ActionService } from '../action/action.service';
import { ChatService } from '../chat/chat.service';
import { OpenViduComponentsConfigService } from '../config/directive-config.service';
import { LoggerService } from '../logger/logger.service';
import { OpenViduService } from '../openvidu/openvidu.service';
import { ParticipantService } from '../participant/participant.service';
import { RecordingService } from '../recording/recording.service';
import { TranslateService } from '../translate/translate.service';

export interface SessionRoomEventCallbacks {
	onRoomReconnecting: () => void;
	onRoomReconnected: () => void;
	onRoomDisconnected: () => void;
	onParticipantLeft: (event: ParticipantLeftEvent) => void;
}

@Injectable({ providedIn: 'root' })
export class SessionRoomEventsService {
	private readonly actionService = inject(ActionService);
	private readonly chatService = inject(ChatService);
	private readonly libService = inject(OpenViduComponentsConfigService);
	private readonly loggerSrv = inject(LoggerService);
	private readonly openviduService = inject(OpenViduService);
	private readonly participantService = inject(ParticipantService);
	private readonly recordingService = inject(RecordingService);
	private readonly translateService = inject(TranslateService);
	private readonly log = this.loggerSrv.get('SessionRoomEventsService');

	bindRoom(room: Room, callbacks: SessionRoomEventCallbacks): void {
		this.subscribeToEncryptionErrors(room);
		this.subscribeToActiveSpeakersChanged(room);
		this.subscribeToParticipantConnected(room);
		this.subscribeToTrackSubscribed(room);
		this.subscribeToTrackUnsubscribed(room);
		this.subscribeToTrackMuteStateChanged(room);
		this.subscribeToParticipantDisconnected(room);
		this.subscribeToParticipantMetadataChanged(room);
		this.subscribeToDataMessage(room);
		this.subscribeToReconnection(room, callbacks);
	}

	private subscribeToEncryptionErrors(room: Room) {
		room.on(RoomEvent.EncryptionError, (error: Error, participant?: Participant) => {
			if (!participant) {
				this.log.w('Encryption error received without participant info:', error);
				return;
			}
			this.participantService.setEncryptionError(participant.sid, true);
		});
	}

	private subscribeToActiveSpeakersChanged(room: Room) {
		room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
			this.participantService.setSpeaking(speakers);
		});
	}

	private subscribeToParticipantConnected(room: Room) {
		room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
			this.participantService.addRemoteParticipant(participant);
		});
	}

	private subscribeToTrackSubscribed(room: Room) {
		room.on(
			RoomEvent.TrackSubscribed,
			(track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
				const isScreenTrack = track.source === Track.Source.ScreenShare;
				this.participantService.addRemoteParticipant(participant);
				if (isScreenTrack) {
					this.participantService.resetMyStreamsToNormalSize();
					this.participantService.resetRemoteStreamsToNormalSize();
					this.participantService.toggleRemoteVideoPinned(track.sid);
					if (track.sid) {
						this.participantService.setScreenTrackPublicationDate(
							participant.sid,
							track.sid,
							new Date().getTime()
						);
					}
				}
			}
		);
	}

	private subscribeToTrackUnsubscribed(room: Room) {
		room.on(
			RoomEvent.TrackUnsubscribed,
			(track: RemoteTrack, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
				this.log.d('TrackUnSubscribed', track, participant);
				const isScreenTrack = track.source === Track.Source.ScreenShare;
				if (isScreenTrack) {
					if (track.sid) {
						this.participantService.setScreenTrackPublicationDate(participant.sid, track.sid, -1);
					}
					this.participantService.resetMyStreamsToNormalSize();
					this.participantService.resetRemoteStreamsToNormalSize();
					this.participantService.setLastScreenPinned();
				}

				if (track.sid) {
					this.participantService.removeRemoteParticipantTrack(participant, track.sid);
				}
			}
		);
	}

	private subscribeToTrackMuteStateChanged(room: Room) {
		const refreshParticipantState = (participant: Participant | RemoteParticipant | LocalParticipant) => {
			if (!participant) return;

			if (participant.isLocal) {
				this.participantService.updateLocalParticipant();
				return;
			}

			this.participantService.updateRemoteParticipants();
		};

		room.on(RoomEvent.TrackMuted, (_publication: TrackPublication, participant: Participant) => {
			refreshParticipantState(participant);
		});

		room.on(RoomEvent.TrackUnmuted, (_publication: TrackPublication, participant: Participant) => {
			refreshParticipantState(participant);
		});
	}

	private subscribeToParticipantDisconnected(room: Room) {
		room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
			this.participantService.removeRemoteParticipant(participant.sid);
		});
	}

	private subscribeToParticipantMetadataChanged(room: Room) {
		room.on(
			RoomEvent.ParticipantMetadataChanged,
			(metadata: string | undefined, participant: RemoteParticipant | LocalParticipant) => {
				this.log.d('ParticipantMetadataChanged', { metadata, participant });
			}
		);
	}

	private subscribeToDataMessage(room: Room) {
		room.on(
			RoomEvent.DataReceived,
			async (payload: Uint8Array, participant?: RemoteParticipant, _?: DataPacket_Kind, topic?: string) => {
				try {
					const decoder = new TextDecoder();
					const fromServer = participant === undefined;
					const storedParticipant = participant
						? this.participantService.getRemoteParticipantBySid(participant.sid || '')
						: undefined;
					if (participant && !storedParticipant) {
						this.log.w('DataReceived from unknown participant', participant);
						return;
					}
					if (!fromServer && !participant) {
						this.log.w('DataReceived from unknown source', payload);
						return;
					}

					const participantIdentity = storedParticipant?.identity || '';
					const participantName = storedParticipant?.name || '';
					const rawText = decoder.decode(payload);
					this.log.d('DataReceived (raw)', { topic });

					const eventMessage = safeJsonParse(rawText);
					if (!eventMessage) {
						this.log.w('Discarding data: malformed JSON', rawText);
						return;
					}

					this.log.d(`Data event received: ${topic}`);
					this.handleDataEvent(topic, eventMessage, participantName || participantIdentity || 'Unknown');
				} catch (err) {
					this.log.e('Unhandled error processing DataReceived', err);
				}
			}
		);
	}

	private handleDataEvent(topic: string | undefined, event: any, participantName: string) {
		switch (topic) {
			case DataTopic.CHAT:
				this.chatService.addRemoteMessage(event.message, participantName);
				break;
			case DataTopic.RECORDING_STARTING:
				this.log.d('Recording is starting', event);
				this.recordingService.setRecordingStarting();
				break;
			case DataTopic.RECORDING_STARTED:
				this.log.d('Recording has been started', event);
				this.recordingService.setRecordingStarted(event);
				break;
			case DataTopic.RECORDING_STOPPING:
				this.log.d('Recording is stopping', event);
				this.recordingService.setRecordingStopping();
				break;
			case DataTopic.RECORDING_STOPPED:
				this.log.d('RECORDING_STOPPED', event);
				this.recordingService.setRecordingStopped(event);
				break;
			case DataTopic.RECORDING_DELETED:
				this.log.d('RECORDING_DELETED', event);
				this.recordingService.deleteRecording(event);
				break;
			case DataTopic.RECORDING_FAILED:
				this.log.d('RECORDING_FAILED', event);
				this.recordingService.setRecordingFailed(event.error);
				break;
			case DataTopic.ROOM_STATUS: {
				const { recordingList, isRecordingStarted } = event as RoomStatusData;

				if (this.libService.showRecordingActivityRecordingsList()) {
					this.recordingService.setRecordingList(recordingList);
				}
				if (isRecordingStarted) {
					const recordingActive = recordingList.find((recording) => recording.status === RecordingState.STARTED);
					this.recordingService.setRecordingStarted(recordingActive);
				}
				break;
			}
			default:
				break;
		}
	}

	private subscribeToReconnection(room: Room, callbacks: SessionRoomEventCallbacks) {
		room.on(RoomEvent.Reconnecting, () => {
			this.log.w('Connection lost: Reconnecting');
			this.actionService.openConnectionDialog(
				this.translateService.translate('ERRORS.CONNECTION'),
				this.translateService.translate('ERRORS.RECONNECT')
			);
			callbacks.onRoomReconnecting();
		});

		room.on(RoomEvent.Reconnected, () => {
			this.log.w('Connection lost: Reconnected');
			this.actionService.closeConnectionDialog();
			callbacks.onRoomReconnected();
		});

		room.on(RoomEvent.Disconnected, async (reason: DisconnectReason | undefined) => {
			this.actionService.closeConnectionDialog();
			const participantLeftEvent: ParticipantLeftEvent = {
				roomName: this.openviduService.getRoomName(),
				participantName: this.participantService.getMyName() || '',
				identity: this.participantService.getMyIdentity() || '',
				reason: ParticipantLeftReason.NETWORK_DISCONNECT
			};
			const messageErrorKey = 'ERRORS.DISCONNECT';
			let descriptionErrorKey = '';
			switch (reason) {
				case DisconnectReason.CLIENT_INITIATED:
					if (!this.openviduService.shouldHandleClientInitiatedDisconnectEvent) return;
					participantLeftEvent.reason = ParticipantLeftReason.LEAVE;
					break;
				case DisconnectReason.DUPLICATE_IDENTITY:
					participantLeftEvent.reason = ParticipantLeftReason.DUPLICATE_IDENTITY;
					descriptionErrorKey = 'ERRORS.DUPLICATE_IDENTITY';
					break;
				case DisconnectReason.SERVER_SHUTDOWN:
					descriptionErrorKey = 'ERRORS.SERVER_SHUTDOWN';
					participantLeftEvent.reason = ParticipantLeftReason.SERVER_SHUTDOWN;
					break;
				case DisconnectReason.PARTICIPANT_REMOVED:
					participantLeftEvent.reason = ParticipantLeftReason.PARTICIPANT_REMOVED;
					descriptionErrorKey = 'ERRORS.PARTICIPANT_REMOVED';
					break;
				case DisconnectReason.ROOM_DELETED:
					participantLeftEvent.reason = ParticipantLeftReason.ROOM_DELETED;
					descriptionErrorKey = 'ERRORS.ROOM_DELETED';
					break;
				case DisconnectReason.SIGNAL_CLOSE:
					participantLeftEvent.reason = ParticipantLeftReason.SIGNAL_CLOSE;
					descriptionErrorKey = 'ERRORS.SIGNAL_CLOSE';
					break;
				default:
					participantLeftEvent.reason = ParticipantLeftReason.OTHER;
					descriptionErrorKey = 'ERRORS.DISCONNECT';
					break;
			}

			this.log.d('Participant disconnected', participantLeftEvent);
			callbacks.onParticipantLeft(participantLeftEvent);
			callbacks.onRoomDisconnected();
			if (this.libService.getShowDisconnectionDialog() && descriptionErrorKey) {
				this.actionService.openDialog(
					this.translateService.translate(messageErrorKey),
					this.translateService.translate(descriptionErrorKey)
				);
			}
		});
	}
}
