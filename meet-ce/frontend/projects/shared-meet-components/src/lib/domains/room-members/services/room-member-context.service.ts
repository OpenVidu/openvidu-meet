import { computed, Injectable, signal } from '@angular/core';
import {
	MeetRoomMember,
	MeetRoomMemberPermissions,
	MeetRoomMemberTokenMetadata,
	MeetRoomMemberTokenOptions
} from '@openvidu-meet/typings';
import { E2eeService, LoggerService } from 'openvidu-components-angular';
import { RoomFeatureService } from '../../../shared/services/room-feature.service';
import { TokenStorageService } from '../../../shared/services/token-storage.service';
import { decodeToken } from '../../../shared/utils/token.utils';
import { RoomMemberService } from './room-member.service';

@Injectable({
	providedIn: 'root'
})
export class RoomMemberContextService {
	protected readonly PARTICIPANT_NAME_KEY = 'ovMeet-participantName';

	/**
	 * Individual signals for room member context
	 */
	private readonly _roomMemberToken = signal<string | undefined>(undefined);
	private readonly _participantName = signal<string | undefined>(undefined);
	private readonly _isParticipantNameFromUrl = signal<boolean>(false);
	private readonly _participantIdentity = signal<string | undefined>(undefined);
	private readonly _permissions = signal<MeetRoomMemberPermissions | undefined>(undefined);
	private readonly _member = signal<MeetRoomMember | undefined>(undefined);

	/** Readonly signal for the room member token */
	readonly roomMemberToken = this._roomMemberToken.asReadonly();
	/** Readonly signal for the participant name */
	readonly participantName = this._participantName.asReadonly();
	/** Readonly signal for whether the participant name came from a URL parameter */
	readonly isParticipantNameFromUrl = this._isParticipantNameFromUrl.asReadonly();
	/** Readonly signal for the participant identity */
	readonly participantIdentity = this._participantIdentity.asReadonly();
	/** Readonly signal for the room member permissions */
	readonly permissions = this._permissions.asReadonly();
	/** Readonly signal for the room member info (when memberId is set) */
	readonly member = this._member.asReadonly();
	/** Computed signal for the room member's display name */
	readonly memberName = computed(() => this._member()?.name);

	protected log;

	constructor(
		protected loggerService: LoggerService,
		protected roomMemberService: RoomMemberService,
		protected roomFeatureService: RoomFeatureService,
		protected tokenStorageService: TokenStorageService,
		protected e2eeService: E2eeService
	) {
		this.log = this.loggerService.get('OpenVidu Meet - RoomMemberContextService');
	}

	/**
	 * Sets the participant's display name and optionally stores it in localStorage.
	 *
	 * @param participantName - The display name of the participant
	 * @param fromUrl - Whether the name came from a URL parameter
	 */
	setParticipantName(participantName: string, fromUrl = false) {
		this._participantName.set(participantName);
		this._isParticipantNameFromUrl.set(fromUrl);
	}

	/**
	 * Saves the participant name to localStorage
	 *
	 * @param participantName - The display name of the participant to save
	 */
	saveParticipantNameToStorage(participantName: string) {
		localStorage.setItem(this.PARTICIPANT_NAME_KEY, participantName);
	}

	/**
	 * Loads the participant name from localStorage
	 */
	loadParticipantNameFromStorage() {
		const storedName = localStorage.getItem(this.PARTICIPANT_NAME_KEY);
		if (storedName) {
			this._participantName.set(storedName);
			this._isParticipantNameFromUrl.set(false);
		}
	}

	/**
	 * Checks if the current room member has a specific permission.
	 *
	 * @param permission - The permission to check
	 * @returns True if the member has the permission, false otherwise
	 */
	hasPermission(permission: keyof MeetRoomMemberPermissions): boolean {
		return this._permissions()?.[permission] ?? false;
	}

	/**
	 * Generates a room member token and updates the context with role and permissions.
	 *
	 * @param roomId - The unique identifier of the room
	 * @param tokenOptions - The options for the token generation
	 * @param e2eeKey - Optional E2EE encryption key
	 * @return A promise that resolves to the room member token
	 */
	async generateToken(roomId: string, tokenOptions: MeetRoomMemberTokenOptions, e2eeKey?: string): Promise<string> {
		if (tokenOptions.participantName && e2eeKey) {
			// Assign E2EE key and encrypt participant name
			await this.e2eeService.setE2EEKey(e2eeKey);
			const encryptedName = await this.e2eeService.encrypt(tokenOptions.participantName);
			tokenOptions.participantName = encryptedName;
		}

		const { token } = await this.roomMemberService.generateRoomMemberToken(roomId, tokenOptions);
		this._roomMemberToken.set(token);
		await this.updateContextFromToken(token);
		return token;
	}

	/**
	 * Updates the room member context based on the provided token.
	 *
	 * @param token - The room member token
	 * @throws Error if the token is invalid or expired.
	 */
	protected async updateContextFromToken(token: string): Promise<void> {
		try {
			const decodedToken = decodeToken(token);
			const metadata = decodedToken.metadata as MeetRoomMemberTokenMetadata;

			if (decodedToken.sub && decodedToken.name) {
				const decryptedName = await this.e2eeService.decrypt(decodedToken.name);
				this._participantName.set(decryptedName);
				this._participantIdentity.set(decodedToken.sub);
			}

			this._permissions.set(metadata.effectivePermissions);

			// If token contains memberId, fetch and store member info
			if (metadata.memberId) {
				try {
					const member = await this.roomMemberService.getRoomMember(metadata.roomId, metadata.memberId);
					this._member.set(member);
				} catch (error) {
					this.log.w('Could not fetch member info:', error);
				}
			}

			// Update feature configuration
			this.roomFeatureService.setRoomMemberRole(metadata.baseRole);
			this.roomFeatureService.setRoomMemberPermissions(metadata.effectivePermissions);
		} catch (error) {
			this.log.e('Error decoding room member token:', error);
			throw new Error('Invalid room member token');
		}
	}

	/**
	 * Clears the room member context, including token, participant info, member, role, and permissions.
	 */
	clearContext(): void {
		this._roomMemberToken.set(undefined);
		this._participantName.set(undefined);
		this._isParticipantNameFromUrl.set(false);
		this._participantIdentity.set(undefined);
		this._permissions.set(undefined);
		this._member.set(undefined);
	}
}
